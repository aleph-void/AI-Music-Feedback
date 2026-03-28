import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── AudioWorklet environment simulation ────────────────────────────────────
// The pcm16-processor.js file is designed for an AudioWorklet context.
// We simulate that environment with globals before each import.

let Pcm16Processor = null

beforeEach(async () => {
  vi.resetModules()

  let capturedClass = null

  // Set up required AudioWorklet globals
  globalThis.AudioWorkletProcessor = class {
    constructor() {
      this.port = { postMessage: vi.fn() }
    }
  }

  // sampleRate global is 48000 by default (simulates a common OS audio rate)
  globalThis.sampleRate = 48000

  globalThis.registerProcessor = (_name, cls) => {
    capturedClass = cls
  }

  await import('../../../src/public/pcm16-processor.js')
  Pcm16Processor = capturedClass
})

// ── Helpers ────────────────────────────────────────────────────────────────

function makeProcessor() {
  const p = new Pcm16Processor()
  p.port = { postMessage: vi.fn() }
  return p
}

/**
 * Build an `inputs` array as the Web Audio API would provide:
 * inputs[0] = array of channel Float32Arrays, each `length` samples.
 */
function makeInputs(channels, values) {
  const channelArrays = values.map(v =>
    v instanceof Float32Array ? v : new Float32Array(v)
  )
  return [channelArrays]
}

/**
 * Push enough audio frames to trigger a chunk emission (>= 4096 resampled samples).
 * At ratio=2 (48kHz→24kHz), each 128-sample input frame produces 64 output samples.
 * We need ceil(4096/64) = 64 frames.
 */
function fillBuffer(processor, framesNeeded = 64, channelCount = 1) {
  const frame = new Float32Array(128).fill(0.5)
  const channels = Array.from({ length: channelCount }, () => frame)
  for (let i = 0; i < framesNeeded; i++) {
    processor.process([channels])
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Pcm16Processor', () => {
  it('registerProcessor is called with "pcm16-processor"', async () => {
    const spy = vi.fn()
    globalThis.registerProcessor = spy
    vi.resetModules()
    await import('../../../src/public/pcm16-processor.js')
    expect(spy).toHaveBeenCalledWith('pcm16-processor', expect.any(Function))
  })

  it('process() returns true to keep the processor alive', () => {
    const p = makeProcessor()
    const result = p.process(makeInputs(1, [new Float32Array(128)]))
    expect(result).toBe(true)
  })

  it('process() returns true for empty inputs without throwing', () => {
    const p = makeProcessor()
    expect(() => p.process([[]])).not.toThrow()
    expect(p.process([[]])).toBe(true)
  })

  it('process() handles null inputs gracefully', () => {
    const p = makeProcessor()
    expect(() => p.process([null])).not.toThrow()
  })

  // ── Mono mixdown ───────────────────────────────────────────────────────────

  it('averages two channels into mono', () => {
    globalThis.sampleRate = 24000 // ratio=1 to avoid resampling
    const p = makeProcessor()

    const left  = new Float32Array(128).fill(0.8)
    const right = new Float32Array(128).fill(0.4)
    p._initialized = false // force re-init with new sampleRate
    p._ratio = 1

    // process with ratio=1, needs 4096 samples to emit
    // Just verify internal buffer accumulation
    p.process([[left, right]])
    // After mixing: (0.8+0.4)/2 = 0.6 for each sample
    expect(p._buffer[0]).toBeCloseTo(0.6, 5)
  })

  it('passes a single mono channel through unchanged', () => {
    globalThis.sampleRate = 24000
    const p = makeProcessor()
    p._initialized = false
    p._ratio = 1

    const mono = new Float32Array(128).fill(0.7)
    p.process([[mono]])
    expect(p._buffer[0]).toBeCloseTo(0.7, 5)
  })

  // ── Resampling ─────────────────────────────────────────────────────────────

  it('produces half the output samples at 48kHz (ratio=2)', () => {
    const p = makeProcessor()
    // sampleRate=48000, targetRate=24000, ratio=2
    const input = new Float32Array(128)
    p.process([[input]])
    // 128 / 2 = 64 output samples pushed
    expect(p._buffer.length).toBe(64)
  })

  it('produces all input samples at 24kHz (ratio=1)', () => {
    globalThis.sampleRate = 24000
    const p = makeProcessor()
    p._initialized = false
    p._ratio = 1

    const input = new Float32Array(128)
    p.process([[input]])
    expect(p._buffer.length).toBe(128)
  })

  // ── Float32 → Int16 conversion ─────────────────────────────────────────────

  it('converts Float32 +1.0 to Int16 +32767', () => {
    const p = makeProcessor()
    p._initialized = true
    p._ratio = 1
    p._CHUNK_SAMPLES = 1 // emit immediately

    const input = new Float32Array(1).fill(1.0)
    p.process([[input]])

    const call = p.port.postMessage.mock.calls[0]
    const pcm16 = new Int16Array(call[0])
    expect(pcm16[0]).toBe(32767)
  })

  it('converts Float32 -1.0 to Int16 -32768', () => {
    const p = makeProcessor()
    p._initialized = true
    p._ratio = 1
    p._CHUNK_SAMPLES = 1

    const input = new Float32Array(1).fill(-1.0)
    p.process([[input]])

    const call = p.port.postMessage.mock.calls[0]
    const pcm16 = new Int16Array(call[0])
    expect(pcm16[0]).toBe(-32768)
  })

  it('converts Float32 0.0 to Int16 0', () => {
    const p = makeProcessor()
    p._initialized = true
    p._ratio = 1
    p._CHUNK_SAMPLES = 1

    const input = new Float32Array(1).fill(0)
    p.process([[input]])

    const call = p.port.postMessage.mock.calls[0]
    const pcm16 = new Int16Array(call[0])
    expect(pcm16[0]).toBe(0)
  })

  // ── Clamping ───────────────────────────────────────────────────────────────

  it('clamps values above +1.0 to +32767', () => {
    const p = makeProcessor()
    p._initialized = true
    p._ratio = 1
    p._CHUNK_SAMPLES = 1

    const input = new Float32Array(1).fill(2.5) // over-driven
    p.process([[input]])

    const call = p.port.postMessage.mock.calls[0]
    const pcm16 = new Int16Array(call[0])
    expect(pcm16[0]).toBe(32767)
  })

  it('clamps values below -1.0 to -32768', () => {
    const p = makeProcessor()
    p._initialized = true
    p._ratio = 1
    p._CHUNK_SAMPLES = 1

    const input = new Float32Array(1).fill(-3.0)
    p.process([[input]])

    const call = p.port.postMessage.mock.calls[0]
    const pcm16 = new Int16Array(call[0])
    expect(pcm16[0]).toBe(-32768)
  })

  // ── Chunk emission ─────────────────────────────────────────────────────────

  it('does not emit a chunk before 4096 samples are buffered', () => {
    const p = makeProcessor()
    const input = new Float32Array(128) // 64 resampled samples at ratio=2
    p.process([[input]])
    expect(p.port.postMessage).not.toHaveBeenCalled()
  })

  it('emits exactly one chunk when buffer reaches 4096 samples', () => {
    const p = makeProcessor()
    fillBuffer(p, 64) // 64 frames × 64 resampled = 4096 samples
    expect(p.port.postMessage).toHaveBeenCalledTimes(1)
  })

  it('emits two chunks when buffer reaches 8192 samples', () => {
    const p = makeProcessor()
    fillBuffer(p, 128) // 128 frames × 64 = 8192 samples
    expect(p.port.postMessage).toHaveBeenCalledTimes(2)
  })

  it('calls postMessage with the buffer as a Transferable (second argument)', () => {
    const p = makeProcessor()
    fillBuffer(p, 64)
    const [buffer, transferables] = p.port.postMessage.mock.calls[0]
    expect(buffer).toBeInstanceOf(ArrayBuffer)
    expect(transferables).toContain(buffer)
  })

  it('emitted buffer has byte length matching 4096 Int16 samples (8192 bytes)', () => {
    const p = makeProcessor()
    fillBuffer(p, 64)
    const [buffer] = p.port.postMessage.mock.calls[0]
    expect(buffer.byteLength).toBe(4096 * 2)
  })

  it('clears emitted samples from the internal buffer after each chunk', () => {
    const p = makeProcessor()
    fillBuffer(p, 64) // exactly 4096 samples → emit 1 chunk, buffer empty
    expect(p._buffer.length).toBe(0)
  })

  it('leaves excess samples in buffer after emission', () => {
    const p = makeProcessor()
    fillBuffer(p, 65) // 65 × 64 = 4160 samples → 1 chunk + 64 leftover
    expect(p._buffer.length).toBe(64)
  })

  // ── Ratio initialization ───────────────────────────────────────────────────

  it('initialises ratio only once across multiple process() calls', () => {
    const p = makeProcessor()
    const input = new Float32Array(128)
    p.process([[input]])
    const firstRatio = p._ratio
    p.process([[input]])
    expect(p._ratio).toBe(firstRatio)
    expect(p._initialized).toBe(true)
  })
})
