import { ref, readonly } from 'vue'
import type { TranscriptMessage } from '@/types/realtime'

const MIN_WINDOW_S = 20
const MAX_WINDOW_S = 60

/** PCM16 sample rate used by the audio worklet — must match AudioContext({ sampleRate }) */
export const ANALYSIS_AUDIO_SAMPLE_RATE = 24_000

// ── Module-level singleton state ──────────────────────────────────────────────

const entries = ref<TranscriptMessage[]>([])
const isAnalyzing = ref(false)

let intervalId: ReturnType<typeof setInterval> | null = null
let sessionId = ''
let windowStartMs = 0
const audioChunks: Uint8Array[] = []

export interface AnalysisConfig {
  provider: 'openai' | 'gemini'
  apiKey: string
  model: string
  windowSeconds: number
  systemPrompt: string
  getTranscript: () => readonly TranscriptMessage[]
  getEnergyLevel?: () => string
}

let activeConfig: AnalysisConfig | null = null

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** Encode accumulated PCM16 chunks into a RIFF WAV buffer. */
export function encodeWav(chunks: Uint8Array[]): Uint8Array {
  const dataBytes = chunks.reduce((n, c) => n + c.byteLength, 0)
  const buf = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buf)
  const out = new Uint8Array(buf)

  const str = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  str(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)                             // PCM chunk size
  view.setUint16(20, 1, true)                              // PCM format
  view.setUint16(22, 1, true)                              // mono
  view.setUint32(24, ANALYSIS_AUDIO_SAMPLE_RATE, true)
  view.setUint32(28, ANALYSIS_AUDIO_SAMPLE_RATE * 2, true) // byte rate
  view.setUint16(32, 2, true)                              // block align
  view.setUint16(34, 16, true)                             // bits per sample
  str(36, 'data')
  view.setUint32(40, dataBytes, true)

  let offset = 44
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/** Encode bytes to base64 in 32 KB chunks to avoid stack overflows on large buffers. */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

const ANALYSIS_SYSTEM_INSTRUCTION =
  'You are a deep music composition analyst receiving session windows. ' +
  'Produce a concise composition memo (under 200 words) covering: ' +
  '(1) what happened musically in this window, ' +
  '(2) 2–3 specific actionable next steps, ' +
  '(3) any harmonic, structural, or arrangement observations. ' +
  'Use musical terminology. Be direct and practical.'

// ── Provider-specific analysis calls ─────────────────────────────────────────

async function analyzeOpenAI(
  config: AnalysisConfig,
  windowMessages: { t: number; speaker: string; text: string }[],
  energyLevel: string,
  packetStart: number,
  packetEnd: number
): Promise<string> {
  const packet = {
    session_id: sessionId,
    window_start_ms: packetStart,
    window_end_ms: packetEnd,
    transcript: windowMessages,
    music_state: { energy_level: energyLevel },
    session_goal: config.systemPrompt,
    requested_task: 'generate next-step composition memo for this window'
  }

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, instructions: ANALYSIS_SYSTEM_INSTRUCTION, input: JSON.stringify(packet) })
  })
  if (!res.ok) throw new Error(`Responses API ${res.status}`)

  const data = await res.json() as {
    output_text?: string
    output?: Array<{ content?: Array<{ type: string; text?: string }> }>
  }
  return data.output_text ??
    data.output?.[0]?.content?.find(c => c.type === 'output_text')?.text ??
    ''
}

async function analyzeGemini(
  config: AnalysisConfig,
  windowMessages: { t: number; speaker: string; text: string }[],
  windowAudio: Uint8Array[],
  packetStart: number,
  packetEnd: number
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`

  const textPart = {
    text: JSON.stringify({
      session_id: sessionId,
      window_start_ms: packetStart,
      window_end_ms: packetEnd,
      transcript: windowMessages,
      session_goal: config.systemPrompt,
      requested_task: 'generate next-step composition memo for this window'
    })
  }

  const parts: object[] = [textPart]
  if (windowAudio.length > 0) {
    parts.push({ inlineData: { mimeType: 'audio/wav', data: toBase64(encodeWav(windowAudio)) } })
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: ANALYSIS_SYSTEM_INSTRUCTION }] },
      contents: [{ parts }]
    })
  })
  if (!res.ok) throw new Error(`Gemini API ${res.status}`)

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

// ── Core analysis tick ────────────────────────────────────────────────────────

export async function runAnalysis(): Promise<void> {
  if (!activeConfig || isAnalyzing.value) return

  const windowEndMs = Date.now()
  const transcript = activeConfig.getTranscript()

  const windowMessages = transcript.filter(
    m => m.role !== 'analysis' && m.timestamp >= windowStartMs && m.timestamp < windowEndMs
  )

  // Grab and clear the audio buffer atomically (JS is single-threaded)
  const windowAudio = audioChunks.splice(0)

  const hasContent = windowMessages.length > 0 || (activeConfig.provider === 'gemini' && windowAudio.length > 0)
  if (!hasContent) {
    windowStartMs = windowEndMs
    return
  }

  const energyLevel = activeConfig.getEnergyLevel?.() ?? 'moderate'
  const packetStart = windowStartMs
  windowStartMs = windowEndMs
  isAnalyzing.value = true

  const entryId = generateId()
  entries.value.push({ id: entryId, role: 'analysis', content: '', complete: false, timestamp: windowEndMs })

  try {
    const mappedMessages = windowMessages.map(m => ({
      t: m.timestamp - packetStart,
      speaker: m.role === 'user' ? 'user' : 'assistant',
      text: m.content
    }))

    let text: string
    if (activeConfig.provider === 'gemini') {
      text = await analyzeGemini(activeConfig, mappedMessages, windowAudio, packetStart, windowEndMs)
    } else {
      text = await analyzeOpenAI(activeConfig, mappedMessages, energyLevel, packetStart, windowEndMs)
    }

    const idx = entries.value.findIndex(e => e.id === entryId)
    if (idx !== -1) entries.value[idx] = { ...entries.value[idx], content: text, complete: true }
  } catch (err) {
    const idx = entries.value.findIndex(e => e.id === entryId)
    if (idx !== -1) entries.value.splice(idx, 1)
    console.error('[useAnalysisEngine]', err)
  } finally {
    isAnalyzing.value = false
  }
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useAnalysisEngine() {
  function start(config: AnalysisConfig): void {
    stop()
    activeConfig = config
    sessionId = `sess-${Date.now()}`
    windowStartMs = Date.now()
    const clampedSeconds = Math.min(MAX_WINDOW_S, Math.max(MIN_WINDOW_S, config.windowSeconds))
    intervalId = setInterval(() => { void runAnalysis() }, clampedSeconds * 1000)
  }

  function stop(): void {
    if (intervalId !== null) { clearInterval(intervalId); intervalId = null }
    activeConfig = null
    isAnalyzing.value = false
    audioChunks.length = 0
  }

  function clear(): void {
    entries.value = []
    audioChunks.length = 0
  }

  function receiveAudioChunk(buffer: ArrayBuffer): void {
    if (activeConfig === null) return
    audioChunks.push(new Uint8Array(buffer))
  }

  return {
    entries: readonly(entries),
    isAnalyzing: readonly(isAnalyzing),
    start,
    stop,
    clear,
    receiveAudioChunk
  }
}
