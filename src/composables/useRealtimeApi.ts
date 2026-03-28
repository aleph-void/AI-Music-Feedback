import { ref, reactive, readonly } from 'vue'
import type { ConnectionStatus, TranscriptMessage, RealtimeSessionConfig } from '@/types/realtime'

const status = ref<ConnectionStatus>('disconnected')
const transcript = ref<TranscriptMessage[]>([])
const statusMessage = ref('')

let ws: WebSocket | null = null
let activeResponseId: string | null = null

// Map from item_id to transcript message for delta accumulation
const itemMap = new Map<string, TranscriptMessage>()

// ── Audio playback ─────────────────────────────────────────────────────────
// Each response.audio.delta chunk is scheduled as an AudioBufferSource node
// against a running cursor so chunks play back-to-back without gaps.
let playbackCtx: AudioContext | null = null
let playbackCursor = 0

function scheduleAudioChunk(base64: string): void {
  if (!playbackCtx || playbackCtx.state === 'closed') {
    playbackCtx = new AudioContext({ sampleRate: 24000 })
    playbackCursor = playbackCtx.currentTime
  }

  // Decode base64 PCM16 → Float32
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  const pcm16 = new Int16Array(bytes.buffer)
  const float32 = new Float32Array(pcm16.length)
  for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768

  const audioBuf = playbackCtx.createBuffer(1, float32.length, 24000)
  audioBuf.getChannelData(0).set(float32)

  const source = playbackCtx.createBufferSource()
  source.buffer = audioBuf
  source.connect(playbackCtx.destination)

  // Schedule at cursor; if we've fallen behind real-time, play immediately
  const startAt = Math.max(playbackCtx.currentTime, playbackCursor)
  source.start(startAt)
  playbackCursor = startAt + audioBuf.duration
}

function stopPlayback(): void {
  playbackCtx?.close()
  playbackCtx = null
  playbackCursor = 0
}

// ── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function addOrUpdateMessage(
  id: string,
  role: 'user' | 'assistant',
  content: string,
  complete: boolean
): TranscriptMessage {
  let msg = itemMap.get(id)
  if (!msg) {
    msg = reactive({ id, role, content, complete, timestamp: Date.now() })
    transcript.value.push(msg)
    itemMap.set(id, msg)
  } else {
    msg.content = content
    msg.complete = complete
  }
  return msg
}

export function useRealtimeApi() {
  function connect(config: RealtimeSessionConfig) {
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      disconnect()
    }

    status.value = 'connecting'
    statusMessage.value = 'Connecting to OpenAI...'

    // Browser WebSocket: pass API key as subprotocol (documented for browser contexts).
    // Trim the key — leading/trailing whitespace is not valid in subprotocol tokens
    // (RFC 6455 requires RFC 2616 token chars; spaces and newlines are forbidden).
    const apiKey = config.apiKey.replace(/\s+/g, '')
    if (!apiKey) {
      status.value = 'error'
      statusMessage.value = 'API key is missing. Enter your key in Settings.'
      return
    }

    ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(config.model)}`,
      [
        'realtime',
        `openai-insecure-api-key.${apiKey}`,
        'openai-beta.realtime-v1'
      ]
    )

    ws.onopen = () => {
      status.value = 'connected'
      statusMessage.value = 'Connected'

      const isAudio = config.outputMode === 'audio'

      send({
        type: 'session.update',
        session: {
          modalities: isAudio ? ['audio', 'text'] : ['text'],
          ...(isAudio && {
            output_audio_format: 'pcm16',
            voice: 'alloy'
          }),
          instructions: config.systemPrompt,
          input_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'whisper-1'
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.4,
            prefix_padding_ms: 300,
            silence_duration_ms: 1500 // longer pause = musical phrase boundary
          }
        }
      })
    }

    ws.onmessage = (event: MessageEvent<string>) => {
      try {
        handleServerEvent(JSON.parse(event.data))
      } catch {
        // ignore malformed events
      }
    }

    ws.onerror = () => {
      status.value = 'error'
      statusMessage.value = 'Connection error'
    }

    ws.onclose = (event) => {
      if (status.value !== 'error') {
        status.value = 'disconnected'
        statusMessage.value = event.wasClean ? 'Disconnected' : `Lost connection (code ${event.code})`
      }
      ws = null
      activeResponseId = null
      stopPlayback()
    }
  }

  function handleServerEvent(event: Record<string, unknown>) {
    switch (event.type) {
      case 'session.created':
        statusMessage.value = 'Session ready — stream your audio'
        break

      case 'conversation.item.input_audio_transcription.completed': {
        const transcript_text = event.transcript as string
        const item_id = (event.item_id as string) ?? generateId()
        const msg = itemMap.get(item_id)
        if (msg) {
          msg.content = transcript_text
          msg.complete = true
        } else {
          addOrUpdateMessage(item_id, 'user', transcript_text, true)
        }
        break
      }

      case 'response.created': {
        activeResponseId = event.response_id as string ?? (event.response as Record<string, unknown>)?.id as string
        break
      }

      case 'response.output_item.added': {
        const item = event.item as Record<string, unknown>
        if (item?.type === 'message' && item?.role === 'assistant') {
          const itemId = item.id as string
          addOrUpdateMessage(itemId, 'assistant', '', false)
        }
        break
      }

      // ── Text output events ───────────────────────────────────────────────

      case 'response.text.delta': {
        const itemId = event.item_id as string
        const delta = event.delta as string
        const msg = itemMap.get(itemId)
        if (msg) {
          msg.content += delta
        } else {
          addOrUpdateMessage(itemId, 'assistant', delta, false)
        }
        break
      }

      case 'response.text.done': {
        const itemId = event.item_id as string
        const msg = itemMap.get(itemId)
        if (msg) {
          msg.content = event.text as string
          msg.complete = true
        }
        break
      }

      // ── Audio output events ──────────────────────────────────────────────

      case 'response.audio.delta': {
        scheduleAudioChunk(event.delta as string)
        break
      }

      // Transcript of what the model is saying (audio mode equivalent of
      // response.text.delta / response.text.done)
      case 'response.audio_transcript.delta': {
        const itemId = event.item_id as string
        const delta = event.delta as string
        const msg = itemMap.get(itemId)
        if (msg) {
          msg.content += delta
        } else {
          addOrUpdateMessage(itemId, 'assistant', delta, false)
        }
        break
      }

      case 'response.audio_transcript.done': {
        const itemId = event.item_id as string
        const msg = itemMap.get(itemId)
        if (msg) {
          msg.content = event.transcript as string
          msg.complete = true
        }
        break
      }

      case 'response.done':
        activeResponseId = null
        break

      case 'error': {
        const error = event.error as Record<string, string>
        status.value = 'error'
        statusMessage.value = `Error: ${error?.message ?? 'Unknown error'} (${error?.code ?? ''})`
        break
      }
    }
  }

  function sendText(text: string) {
    const trimmed = text.trim()
    if (!trimmed || !ws || ws.readyState !== WebSocket.OPEN) return
    const id = generateId()
    addOrUpdateMessage(id, 'user', trimmed, true)
    send({
      type: 'conversation.item.create',
      item: {
        id,
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: trimmed }]
      }
    })
    send({ type: 'response.create' })
  }

  function appendAudio(buffer: ArrayBuffer) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    // Convert ArrayBuffer to base64
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    const base64 = btoa(binary)

    send({
      type: 'input_audio_buffer.append',
      audio: base64
    })
  }

  function send(data: unknown) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data))
    }
  }

  function disconnect() {
    if (ws) {
      ws.close(1000, 'User disconnected')
      ws = null
    }
    status.value = 'disconnected'
    statusMessage.value = ''
    activeResponseId = null
    stopPlayback()
  }

  function clearTranscript() {
    transcript.value = []
    itemMap.clear()
  }

  return {
    status: readonly(status),
    statusMessage: readonly(statusMessage),
    transcript: readonly(transcript),
    connect,
    disconnect,
    appendAudio,
    sendText,
    clearTranscript
  }
}
