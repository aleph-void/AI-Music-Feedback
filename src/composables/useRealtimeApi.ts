import { ref, readonly } from 'vue'
import type { ConnectionStatus, TranscriptMessage, RealtimeSessionConfig } from '@/types/realtime'

const status = ref<ConnectionStatus>('disconnected')
const transcript = ref<TranscriptMessage[]>([])
const statusMessage = ref('')

let ws: WebSocket | null = null
let activeResponseId: string | null = null

// Map from item_id to transcript message for delta accumulation
const itemMap = new Map<string, TranscriptMessage>()

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
    msg = { id, role, content, complete, timestamp: Date.now() }
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

    // Browser WebSocket: pass API key as subprotocol (documented for browser contexts)
    ws = new WebSocket(
      'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
      [
        'realtime',
        `openai-insecure-api-key.${config.apiKey}`,
        'openai-beta.realtime-v1'
      ]
    )

    ws.onopen = () => {
      status.value = 'connected'
      statusMessage.value = 'Connected'

      // Initialize the session
      send({
        type: 'session.update',
        session: {
          modalities: ['text'],
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
        // A new output item (text message) is being started
        const item = event.item as Record<string, unknown>
        if (item?.type === 'message' && item?.role === 'assistant') {
          const itemId = item.id as string
          addOrUpdateMessage(itemId, 'assistant', '', false)
        }
        break
      }

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
    clearTranscript
  }
}
