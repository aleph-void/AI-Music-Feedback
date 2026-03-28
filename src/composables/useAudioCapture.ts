import { ref, readonly } from 'vue'
import type { AudioSource } from '@/types/electron'

type AudioChunkCallback = (buffer: ArrayBuffer) => void
type AudioLevelCallback = (level: number) => void

const sources = ref<AudioSource[]>([])
const isCapturing = ref(false)
const captureError = ref<string | null>(null)

let audioContext: AudioContext | null = null
let workletNode: AudioWorkletNode | null = null
let sourceNode: MediaStreamAudioSourceNode | null = null
let mediaStream: MediaStream | null = null
let silenceTimer: ReturnType<typeof setTimeout> | null = null

// RMS below this level is treated as silence for timeout purposes
const SILENCE_THRESHOLD = 0.01

export function useAudioCapture() {
  async function getSources() {
    try {
      // A brief getUserMedia call is needed to obtain permission so that
      // enumerateDevices() returns device labels.
      const permStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      permStream.getTracks().forEach(t => t.stop())

      const devices = await navigator.mediaDevices.enumerateDevices()
      sources.value = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          id: d.deviceId,
          name: d.label || `Audio Input ${d.deviceId.slice(0, 8)}`,
          type: 'audioinput' as const
        }))
    } catch (err) {
      captureError.value = `Failed to enumerate audio sources: ${err}`
    }
  }

  async function startCapture(
    sourceId: string,
    onChunk: AudioChunkCallback,
    onLevel: AudioLevelCallback,
    silenceTimeoutMs = 0
  ) {
    captureError.value = null

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: sourceId ? { exact: sourceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      })

      // Create AudioContext at target sample rate (24kHz).
      // The worklet handles resampling if the OS doesn't support it natively.
      audioContext = new AudioContext({ sampleRate: 24000 })

      // Load the AudioWorklet processor from the public directory
      const workletUrl = new URL('/pcm16-processor.js', window.location.href).href
      await audioContext.audioWorklet.addModule(workletUrl)

      sourceNode = audioContext.createMediaStreamSource(mediaStream)
      workletNode = new AudioWorkletNode(audioContext, 'pcm16-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0
      })

      // Forward PCM16 chunks to the callback
      workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        // Compute RMS level for the meter from the Int16 data
        const pcm16 = new Int16Array(event.data)
        let sum = 0
        for (let i = 0; i < pcm16.length; i++) {
          sum += (pcm16[i] / 32768) ** 2
        }
        const rms = Math.sqrt(sum / pcm16.length)
        onLevel(Math.min(1, rms * 4))
        onChunk(event.data)

        // Silence timeout: stop capture after N ms of continuous silence
        if (silenceTimeoutMs > 0) {
          if (rms > SILENCE_THRESHOLD) {
            if (silenceTimer !== null) {
              clearTimeout(silenceTimer)
              silenceTimer = null
            }
          } else if (silenceTimer === null) {
            silenceTimer = setTimeout(() => {
              silenceTimer = null
              stopCapture()
            }, silenceTimeoutMs)
          }
        }
      }

      sourceNode.connect(workletNode)
      isCapturing.value = true

      // Handle stream ending (e.g., device disconnected or permission revoked)
      mediaStream.getAudioTracks()[0]?.addEventListener('ended', () => {
        stopCapture()
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        captureError.value = 'Audio capture permission denied. Please allow microphone access.'
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        captureError.value = 'Audio device not found. Please check your audio settings.'
      } else {
        captureError.value = `Failed to start audio capture: ${msg}`
      }
      stopCapture()
    }
  }

  function stopCapture() {
    if (silenceTimer !== null) {
      clearTimeout(silenceTimer)
      silenceTimer = null
    }
    workletNode?.disconnect()
    sourceNode?.disconnect()
    mediaStream?.getTracks().forEach(t => t.stop())
    audioContext?.close()

    workletNode = null
    sourceNode = null
    mediaStream = null
    audioContext = null

    isCapturing.value = false
  }

  return {
    sources: readonly(sources),
    isCapturing: readonly(isCapturing),
    captureError,
    getSources,
    startCapture,
    stopCapture
  }
}
