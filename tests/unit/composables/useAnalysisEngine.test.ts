import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { TranscriptMessage } from '@/types/realtime'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMsg(overrides: Partial<TranscriptMessage> = {}): TranscriptMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'I want a darker feel in bar 8',
    complete: true,
    timestamp: Date.now(),
    ...overrides
  }
}

function mockOkResponse(text: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ output_text: text })
  })
}

function mockErrorResponse(status = 500) {
  return vi.fn().mockResolvedValue({ ok: false, status, text: () => Promise.resolve('Server Error') })
}

// ── Module reset helpers ──────────────────────────────────────────────────────

let useAnalysisEngine: typeof import('@/composables/useAnalysisEngine').useAnalysisEngine
let runAnalysis: typeof import('@/composables/useAnalysisEngine').runAnalysis
let encodeWav: typeof import('@/composables/useAnalysisEngine').encodeWav

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  const mod = await import('@/composables/useAnalysisEngine')
  useAnalysisEngine = mod.useAnalysisEngine
  runAnalysis = mod.runAnalysis
  encodeWav = mod.encodeWav
})

afterEach(() => {
  // Always stop the engine to clear module-level interval
  useAnalysisEngine().stop()
  useAnalysisEngine().clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useAnalysisEngine', () => {
  describe('start() / stop()', () => {
    it('entries and isAnalyzing start empty/false', () => {
      const engine = useAnalysisEngine()
      expect(engine.entries.value).toHaveLength(0)
      expect(engine.isAnalyzing.value).toBe(false)
    })

    it('start() sets up a 30-second interval', () => {
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
      const engine = useAnalysisEngine()
      engine.start({
        provider: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-4.1',
        windowSeconds: 30,
        systemPrompt: 'Be a music analyst',
        getTranscript: () => []
      })
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30_000)
    })

    it('stop() clears the interval', () => {
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [] })
      engine.stop()
      expect(clearIntervalSpy).toHaveBeenCalled()
    })

    it('stop() resets isAnalyzing to false', () => {
      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [] })
      engine.stop()
      expect(engine.isAnalyzing.value).toBe(false)
    })

    it('uses the configured windowSeconds as the interval duration', () => {
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 45, systemPrompt: '', getTranscript: () => [] })
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 45_000)
    })

    it('clamps windowSeconds below 20 up to 20 seconds', () => {
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 5, systemPrompt: '', getTranscript: () => [] })
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 20_000)
    })

    it('clamps windowSeconds above 60 down to 60 seconds', () => {
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 120, systemPrompt: '', getTranscript: () => [] })
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000)
    })

    it('calling start() twice stops the previous interval first', () => {
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [] })
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [] })
      expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('clear()', () => {
    it('removes all entries', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const msg = makeMsg({ timestamp: now })
      globalThis.fetch = mockOkResponse('Some analysis text')

      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [msg] })

      vi.setSystemTime(now + 30_000)
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      expect(engine.entries.value.length).toBeGreaterThan(0)
      engine.clear()
      expect(engine.entries.value).toHaveLength(0)
    })
  })

  describe('runAnalysis() — interval fires', () => {
    it('skips API call when no transcript messages in the window', async () => {
      const fetchMock = vi.fn()
      globalThis.fetch = fetchMock

      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [] })

      vi.advanceTimersByTime(30_000)
      await flushPromises()

      expect(fetchMock).not.toHaveBeenCalled()
      expect(engine.entries.value).toHaveLength(0)
    })

    it('skips analysis entries that are already in the transcript', async () => {
      const fetchMock = vi.fn()
      globalThis.fetch = fetchMock
      const now = Date.now()
      vi.setSystemTime(now)

      const analysisMsg = makeMsg({ role: 'analysis', timestamp: now })
      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [analysisMsg] })

      vi.setSystemTime(now + 30_000)
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('calls the Responses API when there are messages in the window', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const msg = makeMsg({ timestamp: now + 1_000 })
      globalThis.fetch = mockOkResponse('Great harmonic motion here.')

      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [msg] })

      vi.setSystemTime(now + 30_000)
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://api.openai.com/v1/responses')
      expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-test')
    })

    it('sends the correct model in the request body', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const msg = makeMsg({ timestamp: now + 1_000 })
      globalThis.fetch = mockOkResponse('Analysis result')

      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [msg] })

      vi.setSystemTime(now + 30_000)
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      const body = JSON.parse(((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string)
      expect(body.model).toBe('gpt-4.1')
    })

    it('includes the transcript window in the request body', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const msg = makeMsg({ timestamp: now + 5_000, content: 'Try a darker chord' })
      globalThis.fetch = mockOkResponse('Analysis')

      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: 'Help me compose', getTranscript: () => [msg] })

      vi.setSystemTime(now + 30_000)
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      const body = JSON.parse(((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string)
      const packet = JSON.parse(body.input as string)
      expect(packet.transcript[0].text).toBe('Try a darker chord')
      expect(packet.session_goal).toBe('Help me compose')
    })

    it('includes energy level in the packet when getEnergyLevel is provided', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const msg = makeMsg({ timestamp: now + 1_000 })
      globalThis.fetch = mockOkResponse('Analysis')

      const engine = useAnalysisEngine()
      engine.start({
        provider: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-4.1',
        windowSeconds: 30,
        systemPrompt: '',
        getTranscript: () => [msg],
        getEnergyLevel: () => 'loud'
      })

      vi.setSystemTime(now + 30_000)
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      const body = JSON.parse(((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string)
      const packet = JSON.parse(body.input as string)
      expect(packet.music_state.energy_level).toBe('loud')
    })

    it('defaults energy level to "moderate" when getEnergyLevel is not provided', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const msg = makeMsg({ timestamp: now + 1_000 })
      globalThis.fetch = mockOkResponse('Analysis')

      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [msg] })

      vi.setSystemTime(now + 30_000)
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      const body = JSON.parse(((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string)
      const packet = JSON.parse(body.input as string)
      expect(packet.music_state.energy_level).toBe('moderate')
    })
  })

  describe('analysis entries', () => {
    it('creates an analysis entry from output_text on success', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const msg = makeMsg({ timestamp: now + 1_000 })
      globalThis.fetch = mockOkResponse('Try a Neapolitan chord here.')

      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [msg] })

      vi.setSystemTime(now + 30_000)
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      expect(engine.entries.value).toHaveLength(1)
      expect(engine.entries.value[0].role).toBe('analysis')
      expect(engine.entries.value[0].content).toBe('Try a Neapolitan chord here.')
      expect(engine.entries.value[0].complete).toBe(true)
    })

    it('falls back to nested output array when output_text is absent', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const msg = makeMsg({ timestamp: now + 1_000 })
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          output: [{ content: [{ type: 'output_text', text: 'Flatten the sixth.' }] }]
        })
      })

      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [msg] })

      vi.setSystemTime(now + 30_000)
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      expect(engine.entries.value[0].content).toBe('Flatten the sixth.')
    })

    it('removes the placeholder entry when the API returns an error', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const msg = makeMsg({ timestamp: now + 1_000 })
      globalThis.fetch = mockErrorResponse(500)

      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [msg] })

      vi.setSystemTime(now + 30_000)
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      expect(engine.entries.value).toHaveLength(0)
    })

    it('removes the placeholder when fetch throws', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const msg = makeMsg({ timestamp: now + 1_000 })
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [msg] })

      vi.setSystemTime(now + 30_000)
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      expect(engine.entries.value).toHaveLength(0)
    })

    it('analysis entry starts with complete: false while in flight', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const msg = makeMsg({ timestamp: now + 1_000 })

      let resolveJson!: (v: unknown) => void
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => new Promise(r => { resolveJson = r })
      })

      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [msg] })

      vi.setSystemTime(now + 30_000)
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      expect(engine.entries.value[0].complete).toBe(false)
      expect(engine.isAnalyzing.value).toBe(true)

      resolveJson({ output_text: 'Done.' })
      await flushPromises()

      expect(engine.entries.value[0].complete).toBe(true)
      expect(engine.isAnalyzing.value).toBe(false)
    })

    it('does not fire a second analysis while one is already in flight', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const msg = makeMsg({ timestamp: now + 1_000 })
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => new Promise(() => { /* never resolves */ })
      })
      globalThis.fetch = fetchMock

      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [msg] })

      vi.setSystemTime(now + 30_000)
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      // Advance another 30s while the first is still in flight
      vi.setSystemTime(now + 60_000)
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('advances the window start after each analysis run', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const msg1 = makeMsg({ id: 'msg-1', timestamp: now + 1_000 })
      const msg2 = makeMsg({ id: 'msg-2', timestamp: now + 35_000, content: 'Add a bridge section' })
      const fetchMock = mockOkResponse('Window result')
      globalThis.fetch = fetchMock

      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [msg1, msg2] })

      // First window: 0–30s, only msg1 is in range
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      const body1 = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
      const packet1 = JSON.parse(body1.input as string)
      expect(packet1.transcript).toHaveLength(1)
      expect(packet1.transcript[0].text).toBe('I want a darker feel in bar 8')

      // Second window: 30–60s, only msg2 is in range
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      const body2 = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string)
      const packet2 = JSON.parse(body2.input as string)
      expect(packet2.transcript).toHaveLength(1)
      expect(packet2.transcript[0].text).toBe('Add a bridge section')
    })
  })

  describe('runAnalysis() direct call', () => {
    it('does nothing when not started', async () => {
      const fetchMock = vi.fn()
      globalThis.fetch = fetchMock
      await runAnalysis()
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  // ── receiveAudioChunk ──────────────────────────────────────────────────────

  describe('receiveAudioChunk()', () => {
    it('does nothing when engine is not started', () => {
      const engine = useAnalysisEngine()
      // Should not throw
      expect(() => engine.receiveAudioChunk(new ArrayBuffer(512))).not.toThrow()
    })

    it('stop() clears the buffered audio', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ output_text: 'ok' }) })

      const engine = useAnalysisEngine()
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [] })
      engine.receiveAudioChunk(new ArrayBuffer(512))
      engine.stop()

      // After stop, starting again and running should not include stale audio
      const msg = makeMsg({ timestamp: now + 1_000 })
      engine.start({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4.1', windowSeconds: 30, systemPrompt: '', getTranscript: () => [msg] })
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      const body = JSON.parse(((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string)
      const packet = JSON.parse(body.input as string)
      // OpenAI path: no audio key in packet
      expect(packet.window_start_ms).toBeDefined()
    })

    it('clear() also clears the buffered audio', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const fetchMock = vi.fn()
      globalThis.fetch = fetchMock

      const engine = useAnalysisEngine()
      engine.start({ provider: 'gemini', apiKey: 'AIza-test', model: 'gemini-2.0-flash', windowSeconds: 30, systemPrompt: '', getTranscript: () => [] })
      engine.receiveAudioChunk(new ArrayBuffer(512))
      engine.clear()
      engine.stop()

      // After clear, Gemini analysis should not fire (no audio in buffer)
      engine.start({ provider: 'gemini', apiKey: 'AIza-test', model: 'gemini-2.0-flash', windowSeconds: 30, systemPrompt: '', getTranscript: () => [] })
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  // ── Gemini provider ────────────────────────────────────────────────────────

  describe('Gemini analysis', () => {
    const GEMINI_CONFIG = {
      provider: 'gemini' as const,
      apiKey: 'AIza-test-key',
      model: 'gemini-2.0-flash',
      windowSeconds: 30,
      systemPrompt: 'Help me compose',
      getTranscript: () => [] as never[]
    }

    it('calls the Gemini generateContent endpoint', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'Nice chord.' }] } }] })
      })

      const engine = useAnalysisEngine()
      engine.start({ ...GEMINI_CONFIG, getTranscript: () => [] })
      engine.receiveAudioChunk(new ArrayBuffer(256))

      vi.advanceTimersByTime(30_000)
      await flushPromises()

      const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
      expect(url).toContain('generativelanguage.googleapis.com')
      expect(url).toContain('gemini-2.0-flash')
      expect(url).toContain('AIza-test-key')
    })

    it('includes the API key as a query parameter', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
      })

      const engine = useAnalysisEngine()
      engine.start({ ...GEMINI_CONFIG, getTranscript: () => [] })
      engine.receiveAudioChunk(new ArrayBuffer(128))

      vi.advanceTimersByTime(30_000)
      await flushPromises()

      const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
      expect(url).toContain('key=AIza-test-key')
    })

    it('includes audio as inlineData with audio/wav mime type when chunks are present', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
      })

      const engine = useAnalysisEngine()
      engine.start({ ...GEMINI_CONFIG, getTranscript: () => [] })
      engine.receiveAudioChunk(new ArrayBuffer(256))

      vi.advanceTimersByTime(30_000)
      await flushPromises()

      const body = JSON.parse(((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string)
      const parts = body.contents[0].parts as Array<{ inlineData?: { mimeType: string; data: string } }>
      const audioPart = parts.find(p => p.inlineData)
      expect(audioPart?.inlineData?.mimeType).toBe('audio/wav')
      expect(audioPart?.inlineData?.data).toBeTruthy()
    })

    it('omits inlineData when no audio was received', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const msg = makeMsg({ timestamp: now + 1_000 })
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
      })

      const engine = useAnalysisEngine()
      engine.start({ ...GEMINI_CONFIG, getTranscript: () => [msg] })
      // No receiveAudioChunk call

      vi.advanceTimersByTime(30_000)
      await flushPromises()

      const body = JSON.parse(((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string)
      const parts = body.contents[0].parts as Array<{ inlineData?: object }>
      expect(parts.every(p => !p.inlineData)).toBe(true)
    })

    it('skips the API call when there are no messages AND no audio', async () => {
      const fetchMock = vi.fn()
      globalThis.fetch = fetchMock

      const engine = useAnalysisEngine()
      engine.start({ ...GEMINI_CONFIG, getTranscript: () => [] })
      // No audio, no transcript

      vi.advanceTimersByTime(30_000)
      await flushPromises()

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('runs the analysis with audio only (no transcript messages)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'Audio analysis.' }] } }] })
      })
      globalThis.fetch = fetchMock

      const engine = useAnalysisEngine()
      engine.start({ ...GEMINI_CONFIG, getTranscript: () => [] })
      engine.receiveAudioChunk(new ArrayBuffer(256))

      vi.advanceTimersByTime(30_000)
      await flushPromises()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(engine.entries.value[0].content).toBe('Audio analysis.')
    })

    it('parses the response from candidates[0].content.parts[0].text', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'Try a Dorian mode shift.' }] } }]
        })
      })

      const engine = useAnalysisEngine()
      engine.start({ ...GEMINI_CONFIG, getTranscript: () => [] })
      engine.receiveAudioChunk(new ArrayBuffer(128))

      vi.advanceTimersByTime(30_000)
      await flushPromises()

      expect(engine.entries.value[0].content).toBe('Try a Dorian mode shift.')
      expect(engine.entries.value[0].complete).toBe(true)
    })

    it('clears the audio buffer after each window', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
      })
      globalThis.fetch = fetchMock

      const engine = useAnalysisEngine()
      engine.start({ ...GEMINI_CONFIG, getTranscript: () => [] })
      engine.receiveAudioChunk(new ArrayBuffer(256))

      // First window fires — uses the chunk
      vi.advanceTimersByTime(30_000)
      await flushPromises()
      expect(fetchMock).toHaveBeenCalledTimes(1)

      // Second window fires — no new audio, no transcript → skipped
      vi.advanceTimersByTime(30_000)
      await flushPromises()
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('sends system_instruction in the request body', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
      })

      const engine = useAnalysisEngine()
      engine.start({ ...GEMINI_CONFIG, getTranscript: () => [] })
      engine.receiveAudioChunk(new ArrayBuffer(128))

      vi.advanceTimersByTime(30_000)
      await flushPromises()

      const body = JSON.parse(((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string)
      expect(body.system_instruction.parts[0].text).toContain('composition analyst')
    })
  })

  // ── encodeWav ──────────────────────────────────────────────────────────────

  describe('encodeWav()', () => {
    it('produces a valid RIFF WAV header', () => {
      const pcm = new Uint8Array(100).fill(0)
      const wav = encodeWav([pcm])
      expect(wav[0]).toBe(0x52) // R
      expect(wav[1]).toBe(0x49) // I
      expect(wav[2]).toBe(0x46) // F
      expect(wav[3]).toBe(0x46) // F
    })

    it('data section length matches total chunk bytes', () => {
      const a = new Uint8Array(100)
      const b = new Uint8Array(200)
      const wav = encodeWav([a, b])
      const view = new DataView(wav.buffer)
      const dataSize = view.getUint32(40, true)
      expect(dataSize).toBe(300)
      expect(wav.byteLength).toBe(44 + 300)
    })
  })
})
