import { ref, readonly } from 'vue'

type AudioChunkCallback = (buffer: ArrayBuffer) => void
type AudioLevelCallback = (level: number) => void

const isCapturing = ref(false)
const captureError = ref<string | null>(null)

let audioContext: AudioContext | null = null
let workletNode: AudioWorkletNode | null = null
let sourceNode: MediaStreamAudioSourceNode | null = null
let mediaStream: MediaStream | null = null

export function useMicCapture() {
  async function startCapture(
    deviceId: string,
    onChunk: AudioChunkCallback,
    onLevel: AudioLevelCallback
  ) {
    captureError.value = null
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      audioContext = new AudioContext({ sampleRate: 24000 })

      const workletUrl = new URL('/pcm16-processor.js', window.location.href).href
      await audioContext.audioWorklet.addModule(workletUrl)

      sourceNode = audioContext.createMediaStreamSource(mediaStream)
      workletNode = new AudioWorkletNode(audioContext, 'pcm16-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0
      })

      workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        const pcm16 = new Int16Array(event.data)
        let sum = 0
        for (let i = 0; i < pcm16.length; i++) sum += (pcm16[i] / 32768) ** 2
        onLevel(Math.min(1, Math.sqrt(sum / pcm16.length) * 4))
        onChunk(event.data)
      }

      sourceNode.connect(workletNode)
      isCapturing.value = true

      mediaStream.getAudioTracks()[0]?.addEventListener('ended', () => stopCapture())
    } catch (err: unknown) {
      isCapturing.value = false
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        captureError.value = 'Microphone permission denied.'
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        captureError.value = 'Microphone not found.'
      } else {
        captureError.value = `Failed to start microphone: ${err instanceof Error ? err.message : String(err)}`
      }
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
    isCapturing: readonly(isCapturing),
    captureError,
    startCapture,
    stopCapture
  }
}
