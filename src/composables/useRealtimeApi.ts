import { ref, reactive, readonly } from 'vue'
import type { ConnectionStatus, TranscriptMessage, RealtimeSessionConfig } from '@/types/realtime'

// ── Shared module-level state ──────────────────────────────────────────────────

const status = ref<ConnectionStatus>('disconnected')
const transcript = ref<TranscriptMessage[]>([])
const statusMessage = ref('')

let ws: WebSocket | null = null
let activeResponseId: string | null = null
let currentProvider: RealtimeSessionConfig['provider'] | null = null

// Map from item_id to transcript message for delta accumulation
const itemMap = new Map<string, TranscriptMessage>()

// Gemini / Nova Sonic active turn tracking
let geminiActiveItemId: string | null = null
let novaSonicActiveItemId: string | null = null
let novaSonicContentName: string | null = null

// ── Audio playback ─────────────────────────────────────────────────────────────

let playbackCtx: AudioContext | null = null
let playbackCursor = 0

function scheduleAudioChunk(base64: string): void {
  if (!playbackCtx || playbackCtx.state === 'closed') {
    playbackCtx = new AudioContext({ sampleRate: 24000 })
    playbackCursor = playbackCtx.currentTime
  }

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

  const startAt = Math.max(playbackCtx.currentTime, playbackCursor)
  source.start(startAt)
  playbackCursor = startAt + audioBuf.duration
}

function stopPlayback(): void {
  playbackCtx?.close()
  playbackCtx = null
  playbackCursor = 0
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

// ── SigV4 utilities (for Nova Sonic) ──────────────────────────────────────────

async function sha256hex(data: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
}

async function getSigningKey(secret: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${secret}`).buffer, dateStamp)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, service)
  return hmacSha256(kService, 'aws4_request')
}

async function createPresignedWssUrl(
  region: string, host: string, path: string,
  accessKeyId: string, secretKey: string, sessionToken?: string
): Promise<string> {
  const amzDate = new Date().toISOString().replace(/[:\-]/g, '').replace(/\.\d{3}/, '')
  const dateStamp = amzDate.slice(0, 8)
  const credentialScope = `${dateStamp}/${region}/bedrock/aws4_request`

  const params: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', '300'],
    ['X-Amz-SignedHeaders', 'host'],
  ]
  if (sessionToken) params.push(['X-Amz-Security-Token', sessionToken])
  params.sort((a, b) => a[0].localeCompare(b[0]))

  const queryString = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  const canonicalRequest = [
    'GET', path, queryString,
    `host:${host}\n`, 'host',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  ].join('\n')

  const hashedRequest = await sha256hex(canonicalRequest)
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, hashedRequest].join('\n')
  const signingKey = await getSigningKey(secretKey, dateStamp, region, 'bedrock')
  const sigBuf = await hmacSha256(signingKey, stringToSign)
  const signature = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('')

  return `wss://${host}${path}?${queryString}&X-Amz-Signature=${signature}`
}

// ── AWS Event Stream codec (for Nova Sonic) ────────────────────────────────────

let crcTable: Uint32Array | null = null

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    table[i] = c
  }
  return table
}

function crc32(bytes: Uint8Array): number {
  if (!crcTable) crcTable = buildCrcTable()
  let crc = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function encodeEventStreamFrame(headers: Record<string, string>, payloadStr: string): ArrayBuffer {
  const payload = new TextEncoder().encode(payloadStr)
  const headerParts: number[] = []
  for (const [name, value] of Object.entries(headers)) {
    const nameBytes = new TextEncoder().encode(name)
    const valueBytes = new TextEncoder().encode(value)
    headerParts.push(nameBytes.length, ...nameBytes, 7)  // 7 = STRING type
    headerParts.push((valueBytes.length >> 8) & 0xFF, valueBytes.length & 0xFF)
    headerParts.push(...valueBytes)
  }
  const headerBytes = new Uint8Array(headerParts)
  const totalLength = 4 + 4 + 4 + headerBytes.length + payload.length + 4
  const buf = new ArrayBuffer(totalLength)
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)

  let offset = 0
  view.setUint32(offset, totalLength); offset += 4
  view.setUint32(offset, headerBytes.length); offset += 4
  view.setUint32(offset, crc32(bytes.slice(0, 8))); offset += 4
  bytes.set(headerBytes, offset); offset += headerBytes.length
  bytes.set(payload, offset); offset += payload.length
  view.setUint32(offset, crc32(bytes.slice(0, totalLength - 4)))

  return buf
}

function decodeEventStreamFrame(data: ArrayBuffer): { headers: Record<string, string>; payload: string } | null {
  try {
    const view = new DataView(data)
    const bytes = new Uint8Array(data)
    const headersLength = view.getUint32(4)
    let offset = 12
    const headers: Record<string, string> = {}
    const headersEnd = offset + headersLength
    while (offset < headersEnd) {
      const nameLen = bytes[offset++]
      const name = new TextDecoder().decode(bytes.subarray(offset, offset + nameLen)); offset += nameLen
      const type = bytes[offset++]
      if (type === 7) {
        const valueLen = view.getUint16(offset); offset += 2
        headers[name] = new TextDecoder().decode(bytes.subarray(offset, offset + valueLen)); offset += valueLen
      }
    }
    const payloadEnd = view.getUint32(0) - 4
    const payload = new TextDecoder().decode(bytes.subarray(headersEnd, payloadEnd))
    return { headers, payload }
  } catch {
    return null
  }
}

// ── OpenAI handler ─────────────────────────────────────────────────────────────

function connectOpenAI(config: RealtimeSessionConfig) {
  const apiKey = (config.apiKey ?? '').replace(/\s+/g, '')
  if (!apiKey) {
    status.value = 'error'
    statusMessage.value = 'API key is missing. Enter your key in Settings.'
    return
  }

  status.value = 'connecting'
  statusMessage.value = 'Connecting to OpenAI...'

  ws = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(config.model ?? '')}`,
    ['realtime', `openai-insecure-api-key.${apiKey}`, 'openai-beta.realtime-v1']
  )

  ws.onopen = () => {
    status.value = 'connected'
    statusMessage.value = 'Connected'
    const isAudio = config.outputMode === 'audio'
    sendWs({
      type: 'session.update',
      session: {
        modalities: isAudio ? ['audio', 'text'] : ['text'],
        ...(isAudio && { output_audio_format: 'pcm16', voice: 'alloy' }),
        instructions: config.systemPrompt,
        input_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.4,
          prefix_padding_ms: 300,
          silence_duration_ms: 1500
        }
      }
    })
  }

  ws.onmessage = (event: MessageEvent<string>) => {
    try { handleOpenAIEvent(JSON.parse(event.data)) } catch { /* ignore malformed */ }
  }

  ws.onerror = () => { status.value = 'error'; statusMessage.value = 'Connection error' }

  ws.onclose = (event) => {
    if (status.value !== 'error') {
      status.value = 'disconnected'
      statusMessage.value = event.wasClean ? 'Disconnected' : `Lost connection (code ${event.code})`
    }
    ws = null; activeResponseId = null; stopPlayback()
  }
}

function handleOpenAIEvent(event: Record<string, unknown>) {
  switch (event.type) {
    case 'session.created':
      statusMessage.value = 'Session ready — stream your audio'
      break

    case 'conversation.item.input_audio_transcription.completed': {
      const text = event.transcript as string
      const itemId = (event.item_id as string) ?? generateId()
      const msg = itemMap.get(itemId)
      if (msg) { msg.content = text; msg.complete = true }
      else addOrUpdateMessage(itemId, 'user', text, true)
      break
    }

    case 'response.created':
      activeResponseId = event.response_id as string ?? (event.response as Record<string, unknown>)?.id as string
      break

    case 'response.output_item.added': {
      const item = event.item as Record<string, unknown>
      if (item?.type === 'message' && item?.role === 'assistant')
        addOrUpdateMessage(item.id as string, 'assistant', '', false)
      break
    }

    case 'response.text.delta': {
      const itemId = event.item_id as string
      const delta = event.delta as string
      const msg = itemMap.get(itemId)
      if (msg) msg.content += delta
      else addOrUpdateMessage(itemId, 'assistant', delta, false)
      break
    }

    case 'response.text.done': {
      const itemId = event.item_id as string
      const msg = itemMap.get(itemId)
      if (msg) { msg.content = event.text as string; msg.complete = true }
      break
    }

    case 'response.audio.delta':
      scheduleAudioChunk(event.delta as string)
      break

    case 'response.audio_transcript.delta': {
      const itemId = event.item_id as string
      const delta = event.delta as string
      const msg = itemMap.get(itemId)
      if (msg) msg.content += delta
      else addOrUpdateMessage(itemId, 'assistant', delta, false)
      break
    }

    case 'response.audio_transcript.done': {
      const itemId = event.item_id as string
      const msg = itemMap.get(itemId)
      if (msg) { msg.content = event.transcript as string; msg.complete = true }
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

// ── Gemini Live handler ────────────────────────────────────────────────────────

function connectGemini(config: RealtimeSessionConfig) {
  const key = (config.geminiApiKey ?? '').replace(/\s+/g, '')
  if (!key) {
    status.value = 'error'
    statusMessage.value = 'Gemini API key is missing. Enter your key in Settings.'
    return
  }

  status.value = 'connecting'
  statusMessage.value = 'Connecting to Google Gemini...'
  geminiActiveItemId = null

  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`
  ws = new WebSocket(url)

  ws.onopen = () => {
    status.value = 'connected'
    statusMessage.value = 'Connected to Gemini'

    const isAudio = config.outputMode === 'audio'
    sendWs({
      setup: {
        model: 'models/gemini-2.0-flash-exp',
        generationConfig: {
          responseModalities: isAudio ? ['AUDIO', 'TEXT'] : ['TEXT']
        },
        systemInstruction: {
          parts: [{ text: config.systemPrompt }]
        }
      }
    })
  }

  ws.onmessage = (event: MessageEvent<string>) => {
    try { handleGeminiEvent(JSON.parse(event.data)) } catch { /* ignore malformed */ }
  }

  ws.onerror = () => { status.value = 'error'; statusMessage.value = 'Connection error' }

  ws.onclose = (event) => {
    if (status.value !== 'error') {
      status.value = 'disconnected'
      statusMessage.value = event.wasClean ? 'Disconnected' : `Lost connection (code ${event.code})`
    }
    ws = null; geminiActiveItemId = null; stopPlayback()
  }
}

function handleGeminiEvent(event: Record<string, unknown>) {
  if (event.setupComplete) {
    statusMessage.value = 'Session ready — stream your audio'
    return
  }

  if (event.serverContent) {
    const content = event.serverContent as Record<string, unknown>
    const modelTurn = content.modelTurn as Record<string, unknown> | undefined
    const parts = modelTurn?.parts as Array<{ text?: string }> | undefined

    if (parts) {
      const text = parts.map(p => p.text ?? '').join('')
      if (text) {
        if (!geminiActiveItemId) {
          geminiActiveItemId = generateId()
          addOrUpdateMessage(geminiActiveItemId, 'assistant', text, false)
        } else {
          const msg = itemMap.get(geminiActiveItemId)
          if (msg) msg.content += text
        }
      }
    }

    if (content.turnComplete) {
      if (geminiActiveItemId) {
        const msg = itemMap.get(geminiActiveItemId)
        if (msg) msg.complete = true
      }
      geminiActiveItemId = null
    }

    if (content.interrupted) {
      geminiActiveItemId = null
    }
  }
}

// ── Nova Sonic handler ─────────────────────────────────────────────────────────

async function connectNovaSonic(config: RealtimeSessionConfig) {
  const { awsAccessKeyId, awsSecretAccessKey, awsSessionToken, awsRegion } = config
  if (!awsAccessKeyId || !awsSecretAccessKey) {
    status.value = 'error'
    statusMessage.value = 'AWS credentials are missing. Enter Access Key ID and Secret in Settings.'
    return
  }

  status.value = 'connecting'
  statusMessage.value = 'Connecting to Amazon Nova Sonic...'
  novaSonicActiveItemId = null
  novaSonicContentName = null

  const region = awsRegion ?? 'us-east-1'
  const host = `bedrock-runtime.${region}.amazonaws.com`
  const path = '/model/amazon.nova-sonic-v1:0/invoke-with-bidirectional-stream'

  try {
    const url = await createPresignedWssUrl(
      region, host, path,
      awsAccessKeyId, awsSecretAccessKey,
      awsSessionToken || undefined
    )

    ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      status.value = 'connected'
      statusMessage.value = 'Connected to Amazon Nova Sonic'

      sendNovaSonicEvent('sessionStart', JSON.stringify({
        event: {
          sessionStart: {
            inferenceConfiguration: { maxTokens: 1024, topP: 0.9, temperature: 0.7 }
          }
        }
      }))

      sendNovaSonicEvent('promptStart', JSON.stringify({
        event: {
          promptStart: {
            promptName: 'main',
            textOutputConfiguration: { mediaType: 'text/plain' },
            audioInputConfiguration: {
              mediaType: 'audio/lpcm',
              sampleRateHertz: 16000,
              sampleSizeInBits: 16,
              channelCount: 1,
              audioType: 'SPEECH',
              encoding: 'base64'
            },
            systemPrompt: config.systemPrompt
          }
        }
      }))

      novaSonicContentName = generateId()
      sendNovaSonicEvent('contentStart', JSON.stringify({
        event: {
          contentStart: {
            promptName: 'main',
            contentName: novaSonicContentName,
            type: 'AUDIO',
            interactive: true,
            role: 'USER',
            audioInputConfiguration: {
              mediaType: 'audio/lpcm',
              sampleRateHertz: 16000,
              sampleSizeInBits: 16,
              channelCount: 1,
              audioType: 'SPEECH',
              encoding: 'base64'
            }
          }
        }
      }))
    }

    ws.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
      const data = event.data instanceof ArrayBuffer ? event.data : null
      if (!data) return
      const frame = decodeEventStreamFrame(data)
      if (!frame) return
      try { handleNovaSonicEvent(JSON.parse(frame.payload)) } catch { /* ignore malformed */ }
    }

    ws.onerror = () => { status.value = 'error'; statusMessage.value = 'Connection error' }

    ws.onclose = (ev) => {
      if (status.value !== 'error') {
        status.value = 'disconnected'
        statusMessage.value = ev.wasClean ? 'Disconnected' : `Lost connection (code ${ev.code})`
      }
      ws = null; novaSonicActiveItemId = null; novaSonicContentName = null; stopPlayback()
    }
  } catch (e) {
    status.value = 'error'
    statusMessage.value = `Failed to connect to Nova Sonic: ${String(e)}`
  }
}

function sendNovaSonicEvent(eventType: string, payload: string) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(encodeEventStreamFrame({
    ':event-type': eventType,
    ':message-type': 'event',
    ':content-type': 'application/json'
  }, payload))
}

function handleNovaSonicEvent(event: Record<string, unknown>) {
  const ev = event.event as Record<string, unknown> | undefined
  if (!ev) return

  if (ev.contentStart) {
    const cs = ev.contentStart as Record<string, unknown>
    if (cs.type === 'TEXT') {
      novaSonicActiveItemId = generateId()
      addOrUpdateMessage(novaSonicActiveItemId, 'assistant', '', false)
    }
    return
  }

  if (ev.textOutput) {
    const to = ev.textOutput as Record<string, unknown>
    const text = (to.content as string) ?? ''
    if (novaSonicActiveItemId) {
      const msg = itemMap.get(novaSonicActiveItemId)
      if (msg) msg.content += text
    }
    return
  }

  if (ev.contentEnd) {
    if (novaSonicActiveItemId) {
      const msg = itemMap.get(novaSonicActiveItemId)
      if (msg) msg.complete = true
    }
    novaSonicActiveItemId = null
    return
  }
}

// ── Shared send helper ─────────────────────────────────────────────────────────

function sendWs(data: unknown) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
}

// ── Public composable ──────────────────────────────────────────────────────────

export function useRealtimeApi() {
  function connect(config: RealtimeSessionConfig) {
    if (ws && ws.readyState !== WebSocket.CLOSED) disconnect()
    currentProvider = config.provider

    if (config.provider === 'openai') {
      connectOpenAI(config)
    } else if (config.provider === 'gemini') {
      connectGemini(config)
    } else if (config.provider === 'nova-sonic') {
      connectNovaSonic(config) // async — status set immediately to 'connecting'
    }
  }

  function appendAudio(buffer: ArrayBuffer) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    if (currentProvider === 'gemini') {
      sendWs({
        realtimeInput: {
          mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: bufferToBase64(buffer) }]
        }
      })
    } else if (currentProvider === 'nova-sonic') {
      if (novaSonicContentName) {
        sendNovaSonicEvent('audioInput', JSON.stringify({
          event: {
            audioInput: {
              promptName: 'main',
              contentName: novaSonicContentName,
              content: bufferToBase64(buffer)
            }
          }
        }))
      }
    } else {
      // OpenAI
      sendWs({ type: 'input_audio_buffer.append', audio: bufferToBase64(buffer) })
    }
  }

  function sendText(text: string) {
    const trimmed = text.trim()
    if (!trimmed || !ws || ws.readyState !== WebSocket.OPEN) return

    if (currentProvider === 'gemini') {
      sendWs({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: trimmed }] }],
          turnComplete: true
        }
      })
    } else if (currentProvider === 'nova-sonic') {
      const id = generateId()
      addOrUpdateMessage(id, 'user', trimmed, true)
      const contentName = generateId()
      sendNovaSonicEvent('contentStart', JSON.stringify({
        event: { contentStart: { promptName: 'main', contentName, type: 'TEXT', interactive: false, role: 'USER' } }
      }))
      sendNovaSonicEvent('textInput', JSON.stringify({
        event: { textInput: { promptName: 'main', contentName, content: trimmed } }
      }))
      sendNovaSonicEvent('contentEnd', JSON.stringify({
        event: { contentEnd: { promptName: 'main', contentName } }
      }))
    } else {
      // OpenAI
      const id = generateId()
      addOrUpdateMessage(id, 'user', trimmed, true)
      sendWs({
        type: 'conversation.item.create',
        item: { id, type: 'message', role: 'user', content: [{ type: 'input_text', text: trimmed }] }
      })
      sendWs({ type: 'response.create' })
    }
  }

  function disconnect() {
    if (ws) { ws.close(1000, 'User disconnected'); ws = null }
    status.value = 'disconnected'
    statusMessage.value = ''
    activeResponseId = null
    geminiActiveItemId = null
    novaSonicActiveItemId = null
    novaSonicContentName = null
    currentProvider = null
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
