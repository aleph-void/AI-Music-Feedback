import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { useRealtimeApi as UseRealtimeApiFn } from '@/composables/useRealtimeApi'
import { MockWebSocket } from '../../mocks/MockWebSocket'
import { mockAudioContext } from '../../setup'

let useRealtimeApi: typeof UseRealtimeApiFn

beforeEach(async () => {
  vi.resetModules()
  MockWebSocket.reset()
  const mod = await import('@/composables/useRealtimeApi')
  useRealtimeApi = mod.useRealtimeApi
})

// ── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  provider: 'openai' as const,
  apiKey: 'sk-test',
  systemPrompt: 'Be helpful with music feedback',
  model: 'gpt-4o-realtime-preview',
  outputMode: 'text' as const
}

function connectAndOpen(config = DEFAULT_CONFIG) {
  const api = useRealtimeApi()
  api.connect(config)
  const ws = MockWebSocket.lastInstance!
  ws.simulateOpen()
  return { api, ws }
}

describe('useRealtimeApi', () => {
  // ── Initial state ──────────────────────────────────────────────────────────

  it('starts with status = disconnected', () => {
    expect(useRealtimeApi().status.value).toBe('disconnected')
  })

  it('starts with an empty transcript', () => {
    expect(useRealtimeApi().transcript.value).toHaveLength(0)
  })

  it('starts with an empty statusMessage', () => {
    expect(useRealtimeApi().statusMessage.value).toBe('')
  })

  // ── connect() ─────────────────────────────────────────────────────────────

  it('sets status to "connecting" immediately on connect()', () => {
    const api = useRealtimeApi()
    api.connect(DEFAULT_CONFIG)
    expect(api.status.value).toBe('connecting')
  })

  it('sets statusMessage to "Connecting to OpenAI..." on connect()', () => {
    const api = useRealtimeApi()
    api.connect(DEFAULT_CONFIG)
    expect(api.statusMessage.value).toBe('Connecting to OpenAI...')
  })

  it('creates a WebSocket pointing at the OpenAI Realtime endpoint', () => {
    const api = useRealtimeApi()
    api.connect(DEFAULT_CONFIG)
    expect(MockWebSocket.lastInstance!.url).toContain('wss://api.openai.com/v1/realtime')
  })

  it('includes the model parameter in the WebSocket URL', () => {
    const api = useRealtimeApi()
    api.connect(DEFAULT_CONFIG)
    expect(MockWebSocket.lastInstance!.url).toContain('model=gpt-4o-realtime-preview')
  })

  it('passes the API key as a subprotocol', () => {
    const api = useRealtimeApi()
    api.connect({ provider: 'openai', apiKey: 'sk-mykey', systemPrompt: '', model: 'gpt-4o-realtime-preview', outputMode: 'text' })
    const protocols = MockWebSocket.lastInstance!.protocols
    expect(protocols.some(p => p.includes('sk-mykey'))).toBe(true)
  })

  it('sets status to "connected" when WebSocket opens', () => {
    const { api, ws } = connectAndOpen()
    expect(api.status.value).toBe('connected')
  })

  it('sends session.update immediately after connection opens', () => {
    const { ws } = connectAndOpen()
    const sessionUpdate = ws.sent.find((m: unknown) => (m as { type: string }).type === 'session.update')
    expect(sessionUpdate).toBeDefined()
  })

  it('session.update includes the system prompt as instructions', () => {
    const { ws } = connectAndOpen({ provider: 'openai', apiKey: 'sk-test', systemPrompt: 'Give jazz feedback', model: 'gpt-4o-realtime-preview', outputMode: 'text' })
    const update = ws.sent.find((m: unknown) => (m as { type: string }).type === 'session.update') as {
      session: { instructions: string }
    }
    expect(update.session.instructions).toBe('Give jazz feedback')
  })

  it('session.update uses pcm16 as input_audio_format', () => {
    const { ws } = connectAndOpen()
    const update = ws.sent.find((m: unknown) => (m as { type: string }).type === 'session.update') as {
      session: { input_audio_format: string }
    }
    expect(update.session.input_audio_format).toBe('pcm16')
  })

  it('session.update uses text-only modalities', () => {
    const { ws } = connectAndOpen()
    const update = ws.sent.find((m: unknown) => (m as { type: string }).type === 'session.update') as {
      session: { modalities: string[] }
    }
    expect(update.session.modalities).toEqual(['text'])
  })

  it('session.update uses server_vad for turn detection', () => {
    const { ws } = connectAndOpen()
    const update = ws.sent.find((m: unknown) => (m as { type: string }).type === 'session.update') as {
      session: { turn_detection: { type: string } }
    }
    expect(update.session.turn_detection.type).toBe('server_vad')
  })

  // ── disconnect() ──────────────────────────────────────────────────────────

  it('sets status to "disconnected" on disconnect()', () => {
    const { api } = connectAndOpen()
    api.disconnect()
    expect(api.status.value).toBe('disconnected')
  })

  it('clears statusMessage on disconnect()', () => {
    const { api } = connectAndOpen()
    api.disconnect()
    expect(api.statusMessage.value).toBe('')
  })

  it('calls ws.close() on disconnect()', () => {
    const { api, ws } = connectAndOpen()
    const closeSpy = vi.spyOn(ws, 'close')
    api.disconnect()
    expect(closeSpy).toHaveBeenCalled()
  })

  it('does not throw when disconnect() is called without a connection', () => {
    const api = useRealtimeApi()
    expect(() => api.disconnect()).not.toThrow()
  })

  // ── onerror / onclose ─────────────────────────────────────────────────────

  it('sets status to "error" on WebSocket error event', () => {
    const { api, ws } = connectAndOpen()
    ws.simulateError()
    expect(api.status.value).toBe('error')
  })

  it('sets statusMessage on WebSocket error', () => {
    const { api, ws } = connectAndOpen()
    ws.simulateError()
    expect(api.statusMessage.value).toContain('error')
  })

  it('sets status to "disconnected" on clean WebSocket close', () => {
    const { api } = connectAndOpen()
    // Disconnect calls close() which triggers onclose
    api.disconnect()
    // onclose sees status!=='error' -> sets disconnected
    // then disconnect() overwrites statusMessage to ''
    expect(api.status.value).toBe('disconnected')
  })

  it('includes the close code in statusMessage on unclean close', () => {
    const { api, ws } = connectAndOpen()
    ws.simulateClose(false, 1006)
    expect(api.statusMessage.value).toContain('1006')
  })

  // ── Server events ─────────────────────────────────────────────────────────

  it('updates statusMessage on session.created', () => {
    const { api, ws } = connectAndOpen()
    ws.simulateMessage({ type: 'session.created', session: { id: 'sess_1', model: 'm' } })
    expect(api.statusMessage.value).toContain('ready')
  })

  it('creates a new assistant message on response.output_item.added', () => {
    const { api, ws } = connectAndOpen()
    ws.simulateMessage({
      type: 'response.output_item.added',
      item: { type: 'message', role: 'assistant', id: 'item_1' }
    })
    expect(api.transcript.value).toHaveLength(1)
    expect(api.transcript.value[0].role).toBe('assistant')
    expect(api.transcript.value[0].complete).toBe(false)
  })

  it('appends delta text to an existing assistant message', () => {
    const { api, ws } = connectAndOpen()
    ws.simulateMessage({
      type: 'response.output_item.added',
      item: { type: 'message', role: 'assistant', id: 'item_1' }
    })
    ws.simulateMessage({ type: 'response.text.delta', item_id: 'item_1', delta: 'Hello' })
    ws.simulateMessage({ type: 'response.text.delta', item_id: 'item_1', delta: ' world' })
    expect(api.transcript.value[0].content).toBe('Hello world')
  })

  it('creates an assistant message from delta if not pre-created', () => {
    const { api, ws } = connectAndOpen()
    ws.simulateMessage({ type: 'response.text.delta', item_id: 'orphan_1', delta: 'Hi' })
    expect(api.transcript.value[0].content).toBe('Hi')
    expect(api.transcript.value[0].role).toBe('assistant')
  })

  it('marks the message complete on response.text.done', () => {
    const { api, ws } = connectAndOpen()
    ws.simulateMessage({
      type: 'response.output_item.added',
      item: { type: 'message', role: 'assistant', id: 'item_1' }
    })
    ws.simulateMessage({ type: 'response.text.done', item_id: 'item_1', text: 'Final answer' })
    const msg = api.transcript.value[0]
    expect(msg.complete).toBe(true)
    expect(msg.content).toBe('Final answer')
  })

  it('creates a user message on audio transcription completed', () => {
    const { api, ws } = connectAndOpen()
    ws.simulateMessage({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'user_1',
      transcript: 'I played a C major chord'
    })
    const msg = api.transcript.value[0]
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('I played a C major chord')
    expect(msg.complete).toBe(true)
  })

  it('sets status to "error" on error event', () => {
    const { api, ws } = connectAndOpen()
    ws.simulateMessage({
      type: 'error',
      error: { type: 'invalid_request_error', code: 'invalid_api_key', message: 'Invalid key' }
    })
    expect(api.status.value).toBe('error')
    expect(api.statusMessage.value).toContain('Invalid key')
  })

  it('ignores malformed (non-JSON) server messages', () => {
    const { api, ws } = connectAndOpen()
    ws.onmessage?.({ data: 'this is not json {{{}' } as MessageEvent)
    expect(() => {}).not.toThrow()
    expect(api.transcript.value).toHaveLength(0)
  })

  // ── appendAudio() ─────────────────────────────────────────────────────────

  it('sends an input_audio_buffer.append message with base64 audio', () => {
    const { api, ws } = connectAndOpen()
    const buffer = new Uint8Array([0x00, 0x01, 0x7f, 0xff]).buffer
    api.appendAudio(buffer)
    const msg = ws.sent.find(
      (m: unknown) => (m as { type: string }).type === 'input_audio_buffer.append'
    ) as { audio: string }
    expect(msg).toBeDefined()
    expect(typeof msg.audio).toBe('string')
    // Verify round-trip correctness
    const decoded = Uint8Array.from(atob(msg.audio), c => c.charCodeAt(0))
    expect(Array.from(decoded)).toEqual([0x00, 0x01, 0x7f, 0xff])
  })

  it('does nothing when appendAudio is called while disconnected', () => {
    const api = useRealtimeApi()
    expect(() => api.appendAudio(new ArrayBuffer(8))).not.toThrow()
    expect(MockWebSocket.lastInstance).toBeNull()
  })

  // ── clearTranscript() ─────────────────────────────────────────────────────

  it('empties the transcript array', () => {
    const { api, ws } = connectAndOpen()
    ws.simulateMessage({
      type: 'response.output_item.added',
      item: { type: 'message', role: 'assistant', id: 'item_1' }
    })
    expect(api.transcript.value).toHaveLength(1)
    api.clearTranscript()
    expect(api.transcript.value).toHaveLength(0)
  })

  it('allows new messages to be added after clearing', () => {
    const { api, ws } = connectAndOpen()
    ws.simulateMessage({
      type: 'response.output_item.added',
      item: { type: 'message', role: 'assistant', id: 'item_1' }
    })
    api.clearTranscript()
    ws.simulateMessage({
      type: 'response.output_item.added',
      item: { type: 'message', role: 'assistant', id: 'item_2' }
    })
    expect(api.transcript.value).toHaveLength(1)
    expect(api.transcript.value[0].id).toBe('item_2')
  })

  it('clears the itemMap so a delta for an old item_id creates a fresh message', () => {
    const { api, ws } = connectAndOpen()
    ws.simulateMessage({
      type: 'response.output_item.added',
      item: { type: 'message', role: 'assistant', id: 'item_1' }
    })
    ws.simulateMessage({ type: 'response.text.delta', item_id: 'item_1', delta: 'old' })
    api.clearTranscript()
    // Same item_id after clear — itemMap is empty so addOrUpdateMessage creates a new entry
    ws.simulateMessage({ type: 'response.text.delta', item_id: 'item_1', delta: 'new content' })
    expect(api.transcript.value).toHaveLength(1)
    expect(api.transcript.value[0].content).toBe('new content')
  })

  // ── Output mode: text ──────────────────────────────────────────────────────

  it('text mode sends modalities: ["text"]', () => {
    const { ws } = connectAndOpen({ ...DEFAULT_CONFIG, outputMode: 'text' })
    const update = ws.sent.find((m: unknown) => (m as { type: string }).type === 'session.update') as {
      session: { modalities: string[]; output_audio_format?: string }
    }
    expect(update.session.modalities).toEqual(['text'])
    expect(update.session.output_audio_format).toBeUndefined()
  })

  // ── Output mode: audio ─────────────────────────────────────────────────────

  it('audio mode sends modalities: ["audio", "text"]', () => {
    const { ws } = connectAndOpen({ ...DEFAULT_CONFIG, outputMode: 'audio' })
    const update = ws.sent.find((m: unknown) => (m as { type: string }).type === 'session.update') as {
      session: { modalities: string[] }
    }
    expect(update.session.modalities).toEqual(['audio', 'text'])
  })

  it('audio mode includes output_audio_format: "pcm16"', () => {
    const { ws } = connectAndOpen({ ...DEFAULT_CONFIG, outputMode: 'audio' })
    const update = ws.sent.find((m: unknown) => (m as { type: string }).type === 'session.update') as {
      session: { output_audio_format: string }
    }
    expect(update.session.output_audio_format).toBe('pcm16')
  })

  it('audio mode includes a voice field', () => {
    const { ws } = connectAndOpen({ ...DEFAULT_CONFIG, outputMode: 'audio' })
    const update = ws.sent.find((m: unknown) => (m as { type: string }).type === 'session.update') as {
      session: { voice: string }
    }
    expect(update.session.voice).toBeDefined()
    expect(typeof update.session.voice).toBe('string')
  })

  it('response.audio.delta creates an AudioContext and schedules a chunk', () => {
    const { ws } = connectAndOpen({ ...DEFAULT_CONFIG, outputMode: 'audio' })
    // 4 PCM16 samples encoded as base64
    const samples = new Int16Array([0, 1000, -1000, 32767])
    const base64 = btoa(String.fromCharCode(...new Uint8Array(samples.buffer)))
    ws.simulateMessage({ type: 'response.audio.delta', delta: base64 })
    expect(AudioContext).toHaveBeenCalled()
    expect(mockAudioContext.createBuffer).toHaveBeenCalled()
    expect(mockAudioContext.createBufferSource).toHaveBeenCalled()
  })

  it('response.audio_transcript.delta appends to the assistant transcript', () => {
    const { api, ws } = connectAndOpen({ ...DEFAULT_CONFIG, outputMode: 'audio' })
    ws.simulateMessage({
      type: 'response.output_item.added',
      item: { type: 'message', role: 'assistant', id: 'item_a' }
    })
    ws.simulateMessage({ type: 'response.audio_transcript.delta', item_id: 'item_a', delta: 'Nice ' })
    ws.simulateMessage({ type: 'response.audio_transcript.delta', item_id: 'item_a', delta: 'chord.' })
    expect(api.transcript.value[0].content).toBe('Nice chord.')
  })

  it('response.audio_transcript.done marks the message complete', () => {
    const { api, ws } = connectAndOpen({ ...DEFAULT_CONFIG, outputMode: 'audio' })
    ws.simulateMessage({
      type: 'response.output_item.added',
      item: { type: 'message', role: 'assistant', id: 'item_a' }
    })
    ws.simulateMessage({
      type: 'response.audio_transcript.done',
      item_id: 'item_a',
      transcript: 'Final spoken text.'
    })
    const msg = api.transcript.value[0]
    expect(msg.complete).toBe(true)
    expect(msg.content).toBe('Final spoken text.')
  })

  // ── sendText() ────────────────────────────────────────────────────────────

  it('sendText sends conversation.item.create and response.create', () => {
    const { api, ws } = connectAndOpen()
    api.sendText('What do you think of the mix?')
    const create = ws.sent.find((m: unknown) => (m as { type: string }).type === 'conversation.item.create') as {
      item: { type: string; role: string; content: { type: string; text: string }[] }
    }
    expect(create).toBeDefined()
    expect(create.item.role).toBe('user')
    expect(create.item.content[0].type).toBe('input_text')
    expect(create.item.content[0].text).toBe('What do you think of the mix?')
    const responseCreate = ws.sent.find((m: unknown) => (m as { type: string }).type === 'response.create')
    expect(responseCreate).toBeDefined()
  })

  it('sendText adds the message to the transcript immediately', () => {
    const { api } = connectAndOpen()
    api.sendText('Great bass line!')
    const msg = api.transcript.value.find(m => m.role === 'user' && m.content === 'Great bass line!')
    expect(msg).toBeDefined()
    expect(msg?.complete).toBe(true)
  })

  it('sendText trims whitespace from the text', () => {
    const { api, ws } = connectAndOpen()
    api.sendText('  hello  ')
    const create = ws.sent.find((m: unknown) => (m as { type: string }).type === 'conversation.item.create') as {
      item: { content: { text: string }[] }
    }
    expect(create.item.content[0].text).toBe('hello')
  })

  it('sendText does nothing when not connected', () => {
    const api = useRealtimeApi()
    api.sendText('hello')
    expect(MockWebSocket.lastInstance).toBeNull()
  })

  it('sendText does nothing when text is empty', () => {
    const { api, ws } = connectAndOpen()
    const sentBefore = ws.sent.length
    api.sendText('   ')
    expect(ws.sent.length).toBe(sentBefore)
  })

  // ── generateId uniqueness ──────────────────────────────────────────────────

  it('generates unique IDs across 100 consecutive sendText calls', () => {
    const { api } = connectAndOpen()
    for (let i = 0; i < 100; i++) {
      api.sendText(`message ${i}`)
    }
    const ids = api.transcript.value.map(m => m.id)
    expect(new Set(ids).size).toBe(100)
  })

  it('encodes special characters in model name in the WebSocket URL', () => {
    const api = useRealtimeApi()
    api.connect({ ...DEFAULT_CONFIG, model: 'gpt-4o&version=preview=1' })
    const ws = MockWebSocket.lastInstance!
    expect(ws.url).toContain(encodeURIComponent('gpt-4o&version=preview=1'))
    expect(ws.url).not.toContain('gpt-4o&version=preview=1')
  })

  it('closes the playback AudioContext on disconnect', () => {
    const { api, ws } = connectAndOpen({ ...DEFAULT_CONFIG, outputMode: 'audio' })
    const samples = new Int16Array([0])
    const base64 = btoa(String.fromCharCode(...new Uint8Array(samples.buffer)))
    ws.simulateMessage({ type: 'response.audio.delta', delta: base64 })
    api.disconnect()
    expect(mockAudioContext.close).toHaveBeenCalled()
  })

  // ── Gemini Live provider ───────────────────────────────────────────────────

  const GEMINI_CONFIG = {
    provider: 'gemini' as const,
    geminiApiKey: 'AIza-test-key',
    systemPrompt: 'Feedback on my music',
    outputMode: 'text' as const
  }

  function connectGeminiAndOpen(config = GEMINI_CONFIG) {
    const api = useRealtimeApi()
    api.connect(config)
    const ws = MockWebSocket.lastInstance!
    ws.simulateOpen()
    return { api, ws }
  }

  it('connect() with gemini creates a WebSocket to the Gemini Live endpoint', () => {
    const api = useRealtimeApi()
    api.connect(GEMINI_CONFIG)
    expect(MockWebSocket.lastInstance!.url).toContain('generativelanguage.googleapis.com')
  })

  it('connect() with gemini includes the API key as a query param', () => {
    const api = useRealtimeApi()
    api.connect(GEMINI_CONFIG)
    expect(MockWebSocket.lastInstance!.url).toContain('key=AIza-test-key')
  })

  it('connect() with gemini sets status to "connecting"', () => {
    const api = useRealtimeApi()
    api.connect(GEMINI_CONFIG)
    expect(api.status.value).toBe('connecting')
  })

  it('connect() with gemini sets status to "connected" on ws open', () => {
    const { api } = connectGeminiAndOpen()
    expect(api.status.value).toBe('connected')
  })

  it('sends a setup message with systemInstruction after Gemini connection opens', () => {
    const { ws } = connectGeminiAndOpen()
    const msg = ws.sent.find((m: unknown) => !!(m as { setup?: unknown }).setup) as {
      setup: { systemInstruction: { parts: [{ text: string }] } }
    }
    expect(msg).toBeDefined()
    expect(msg.setup.systemInstruction.parts[0].text).toBe('Feedback on my music')
  })

  it('sets statusMessage to ready on Gemini setupComplete event', () => {
    const { api, ws } = connectGeminiAndOpen()
    ws.simulateMessage({ setupComplete: {} })
    expect(api.statusMessage.value).toContain('ready')
  })

  it('adds an assistant message on Gemini serverContent with text', () => {
    const { api, ws } = connectGeminiAndOpen()
    ws.simulateMessage({
      serverContent: {
        modelTurn: { parts: [{ text: 'Great bass line!' }] }
      }
    })
    expect(api.transcript.value).toHaveLength(1)
    expect(api.transcript.value[0].content).toBe('Great bass line!')
    expect(api.transcript.value[0].role).toBe('assistant')
  })

  it('accumulates text across multiple Gemini serverContent events in the same turn', () => {
    const { api, ws } = connectGeminiAndOpen()
    ws.simulateMessage({ serverContent: { modelTurn: { parts: [{ text: 'Nice ' }] } } })
    ws.simulateMessage({ serverContent: { modelTurn: { parts: [{ text: 'groove.' }] } } })
    expect(api.transcript.value).toHaveLength(1)
    expect(api.transcript.value[0].content).toBe('Nice groove.')
  })

  it('marks the message complete on Gemini turnComplete', () => {
    const { api, ws } = connectGeminiAndOpen()
    ws.simulateMessage({ serverContent: { modelTurn: { parts: [{ text: 'Done.' }] }, turnComplete: true } })
    expect(api.transcript.value[0].complete).toBe(true)
  })

  it('starts a new message after Gemini turnComplete on the next serverContent', () => {
    const { api, ws } = connectGeminiAndOpen()
    ws.simulateMessage({ serverContent: { modelTurn: { parts: [{ text: 'First.' }] }, turnComplete: true } })
    ws.simulateMessage({ serverContent: { modelTurn: { parts: [{ text: 'Second.' }] } } })
    expect(api.transcript.value).toHaveLength(2)
    expect(api.transcript.value[1].content).toBe('Second.')
  })

  it('appendAudio() sends realtimeInput.mediaChunks to Gemini', () => {
    const { api, ws } = connectGeminiAndOpen()
    api.appendAudio(new ArrayBuffer(4))
    const msg = ws.sent.find((m: unknown) => !!(m as { realtimeInput?: unknown }).realtimeInput)
    expect(msg).toBeDefined()
  })

  it('sendText() sends clientContent to Gemini', () => {
    const { api, ws } = connectGeminiAndOpen()
    api.sendText('How is the reverb?')
    const msg = ws.sent.find((m: unknown) => !!(m as { clientContent?: unknown }).clientContent) as {
      clientContent: { turns: [{ parts: [{ text: string }] }] }
    }
    expect(msg).toBeDefined()
    expect(msg.clientContent.turns[0].parts[0].text).toBe('How is the reverb?')
  })

  it('connect() with gemini sets error status when geminiApiKey is empty', () => {
    const api = useRealtimeApi()
    api.connect({ provider: 'gemini', geminiApiKey: '', systemPrompt: '', outputMode: 'text' })
    expect(api.status.value).toBe('error')
    expect(MockWebSocket.lastInstance).toBeNull()
  })

  it('switching from openai to gemini disconnects the openai WebSocket', () => {
    const api = useRealtimeApi()
    api.connect(DEFAULT_CONFIG)
    const openaiWs = MockWebSocket.lastInstance!
    api.connect(GEMINI_CONFIG)
    expect(openaiWs.readyState).toBe(WebSocket.CLOSED)
  })

  // ── Nova Sonic provider ────────────────────────────────────────────────────

  const NOVA_SONIC_CONFIG = {
    provider: 'nova-sonic' as const,
    awsAccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    awsSecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    awsSessionToken: '',
    awsRegion: 'us-east-1',
    systemPrompt: 'Help with music',
    outputMode: 'text' as const
  }

  it('connect() with nova-sonic sets status to "connecting" immediately', () => {
    const api = useRealtimeApi()
    api.connect(NOVA_SONIC_CONFIG)
    expect(api.status.value).toBe('connecting')
  })

  it('connect() with nova-sonic sets error status when credentials are missing', () => {
    const api = useRealtimeApi()
    api.connect({ ...NOVA_SONIC_CONFIG, awsAccessKeyId: '', awsSecretAccessKey: '' })
    expect(api.status.value).toBe('error')
    expect(api.statusMessage.value).toContain('AWS credentials')
  })

  it('connect() with nova-sonic connects to the Bedrock endpoint after SigV4 signing', async () => {
    const api = useRealtimeApi()
    api.connect(NOVA_SONIC_CONFIG)
    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull(), { timeout: 2000 })
    expect(MockWebSocket.lastInstance!.url).toContain('bedrock-runtime.us-east-1.amazonaws.com')
    expect(MockWebSocket.lastInstance!.url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256')
    expect(MockWebSocket.lastInstance!.url).toContain('X-Amz-Credential=AKIAIOSFODNN7EXAMPLE')
  })

  it('connect() with nova-sonic signed URL contains X-Amz-Signature', async () => {
    const api = useRealtimeApi()
    api.connect(NOVA_SONIC_CONFIG)
    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull(), { timeout: 2000 })
    expect(MockWebSocket.lastInstance!.url).toContain('X-Amz-Signature=')
  })

  it('connect() with nova-sonic respects the configured region', async () => {
    const api = useRealtimeApi()
    api.connect({ ...NOVA_SONIC_CONFIG, awsRegion: 'eu-west-1' })
    await vi.waitFor(() => expect(MockWebSocket.lastInstance).not.toBeNull(), { timeout: 2000 })
    expect(MockWebSocket.lastInstance!.url).toContain('bedrock-runtime.eu-west-1.amazonaws.com')
  })
})
