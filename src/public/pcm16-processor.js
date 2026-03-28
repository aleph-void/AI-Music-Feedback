/**
 * AudioWorklet processor: converts multi-channel Float32 audio to mono PCM16
 * at 24kHz for the OpenAI Realtime API.
 *
 * Runs on the dedicated audio rendering thread — no DOM or window access.
 */
class Pcm16Processor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return []
  }

  constructor() {
    super()
    this._buffer = []
    this._CHUNK_SAMPLES = 4096 // ~170ms at 24kHz
    this._targetRate = 24000
    this._initialized = false
    this._ratio = 1 // set on first process() call when sampleRate is known
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input.length || !input[0] || !input[0].length) return true

    // Initialize resampling ratio on first call (sampleRate is a global in worklet scope)
    if (!this._initialized) {
      this._ratio = sampleRate / this._targetRate
      this._initialized = true
    }

    // Mix all input channels down to mono
    const channelCount = input.length
    const frameCount = input[0].length
    const mono = new Float32Array(frameCount)
    for (let ch = 0; ch < channelCount; ch++) {
      const channel = input[ch]
      for (let i = 0; i < frameCount; i++) {
        mono[i] += channel[i]
      }
    }
    if (channelCount > 1) {
      for (let i = 0; i < frameCount; i++) {
        mono[i] /= channelCount
      }
    }

    // Resample by linear decimation
    // If sampleRate === targetRate, ratio === 1 and every sample is included.
    if (this._ratio === 1) {
      for (let i = 0; i < frameCount; i++) {
        this._buffer.push(mono[i])
      }
    } else {
      // Linear interpolation decimation
      for (let i = 0; i < frameCount; i += this._ratio) {
        const lo = Math.floor(i)
        const hi = Math.min(lo + 1, frameCount - 1)
        const frac = i - lo
        this._buffer.push(mono[lo] * (1 - frac) + mono[hi] * frac)
      }
    }

    // Emit fixed-size PCM16 chunks via Transferable (zero-copy)
    while (this._buffer.length >= this._CHUNK_SAMPLES) {
      const chunk = this._buffer.splice(0, this._CHUNK_SAMPLES)
      const pcm16 = new Int16Array(this._CHUNK_SAMPLES)
      for (let i = 0; i < this._CHUNK_SAMPLES; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]))
        pcm16[i] = s < 0 ? s * 32768 : s * 32767
      }
      this.port.postMessage(pcm16.buffer, [pcm16.buffer])
    }

    return true // keep processor alive
  }
}

registerProcessor('pcm16-processor', Pcm16Processor)
