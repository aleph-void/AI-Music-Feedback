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

export function useAudioCapture() {
  async function getSources() {
    try {
      sources.value = await window.electronAPI.getAudioSources()
    } catch (err) {
      captureError.value = `Failed to enumerate audio sources: ${err}`
    }
  }

  async function startCapture(
    onChunk: AudioChunkCallback,
    onLevel: AudioLevelCallback
  ) {
    captureError.value = null

    try {
      // Request display media — Electron's setDisplayMediaRequestHandler handles this
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: false,
        audio: {
          // Prefer system audio / loopback
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        } as MediaTrackConstraints
      })

      // Create AudioContext at target sample rate (24kHz).
      // If the OS doesn't support it natively, the worklet handles resampling.
      audioContext = new AudioContext({ sampleRate: 24000 })

      // Load the AudioWorklet processor from the public directory
      const workletUrl = new URL('/pcm16-processor.js', window.location.href).href
      await audioContext.audioWorklet.addModule(workletUrl)

      sourceNode = audioContext.createMediaStreamSource(mediaStream)
      workletNode = new AudioWorkletNode(audioContext, 'pcm16-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0 // no audio output needed
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
        onLevel(Math.min(1, rms * 4)) // scale up for visibility

        onChunk(event.data)
      }

      sourceNode.connect(workletNode)
      isCapturing.value = true

      // Handle stream ending (e.g., user closes the share dialog)
      mediaStream.getAudioTracks()[0]?.addEventListener('ended', () => {
        stopCapture()
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Permission denied') || msg.includes('NotAllowed')) {
        captureError.value = 'Audio capture permission denied. Please allow screen/audio recording access.'
      } else {
        captureError.value = `Failed to start audio capture: ${msg}`
      }
      stopCapture()
    }
  }

  function stopCapture() {
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
