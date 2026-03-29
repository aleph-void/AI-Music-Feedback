import { ref, readonly } from 'vue'
import type { TranscriptMessage } from '@/types/realtime'

const MIN_WINDOW_S = 20
const MAX_WINDOW_S = 60

// ── Module-level singleton state ──────────────────────────────────────────────

const entries = ref<TranscriptMessage[]>([])
const isAnalyzing = ref(false)

let intervalId: ReturnType<typeof setInterval> | null = null
let sessionId = ''
let windowStartMs = 0

export interface AnalysisConfig {
  apiKey: string
  model: string
  windowSeconds: number
  systemPrompt: string
  getTranscript: () => readonly TranscriptMessage[]
  getEnergyLevel?: () => string
}

let activeConfig: AnalysisConfig | null = null

function generateId(): string {
  return `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export async function runAnalysis(): Promise<void> {
  if (!activeConfig || isAnalyzing.value) return

  const windowEndMs = Date.now()
  const transcript = activeConfig.getTranscript()

  const windowMessages = transcript.filter(
    m => m.role !== 'analysis' && m.timestamp >= windowStartMs && m.timestamp < windowEndMs
  )

  if (windowMessages.length === 0) {
    windowStartMs = windowEndMs
    return
  }

  const energyLevel = activeConfig.getEnergyLevel?.() ?? 'moderate'

  const packet = {
    session_id: sessionId,
    window_start_ms: windowStartMs,
    window_end_ms: windowEndMs,
    transcript: windowMessages.map(m => ({
      t: m.timestamp - windowStartMs,
      speaker: m.role === 'user' ? 'user' : 'assistant',
      text: m.content
    })),
    music_state: { energy_level: energyLevel },
    session_goal: activeConfig.systemPrompt,
    requested_task: 'generate next-step composition memo for this 30-second window'
  }

  windowStartMs = windowEndMs
  isAnalyzing.value = true

  const entryId = generateId()
  entries.value.push({
    id: entryId,
    role: 'analysis',
    content: '',
    complete: false,
    timestamp: windowEndMs
  })

  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${activeConfig.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: activeConfig.model,
        instructions:
          'You are a deep music composition analyst receiving 30-second session windows. ' +
          'Produce a concise composition memo (under 200 words) covering: ' +
          '(1) what happened musically in this window, ' +
          '(2) 2–3 specific actionable next steps, ' +
          '(3) any harmonic, structural, or arrangement observations. ' +
          'Use musical terminology. Be direct and practical.',
        input: JSON.stringify(packet)
      })
    })

    if (!res.ok) {
      throw new Error(`Responses API ${res.status}`)
    }

    const data = await res.json() as {
      output_text?: string
      output?: Array<{ content?: Array<{ type: string; text?: string }> }>
    }

    const text =
      data.output_text ??
      data.output?.[0]?.content?.find(c => c.type === 'output_text')?.text ??
      ''

    const idx = entries.value.findIndex(e => e.id === entryId)
    if (idx !== -1) {
      entries.value[idx] = { ...entries.value[idx], content: text, complete: true }
    }
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
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
    activeConfig = null
    isAnalyzing.value = false
  }

  function clear(): void {
    entries.value = []
  }

  return {
    entries: readonly(entries),
    isAnalyzing: readonly(isAnalyzing),
    start,
    stop,
    clear
  }
}
