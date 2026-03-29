import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { useSettings as UseSettingsFn } from '@/composables/useSettings'

// Composable has module-level state — re-import fresh each test via resetModules
let useSettings: typeof UseSettingsFn

beforeEach(async () => {
  vi.resetModules()
  const mod = await import('@/composables/useSettings')
  useSettings = mod.useSettings
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(models: { id: string }[], ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue({ data: models })
  })
}

describe('useSettings', () => {
  // ── Initial state ──────────────────────────────────────────────────────────

  it('starts with an empty apiKey', () => {
    const { apiKey } = useSettings()
    expect(apiKey.value).toBe('')
  })

  it('starts with a non-empty default system prompt', () => {
    const { systemPrompt } = useSettings()
    expect(systemPrompt.value.length).toBeGreaterThan(20)
    expect(systemPrompt.value.toLowerCase()).toContain('music')
  })

  it('starts with isLoaded = false', () => {
    const { isLoaded } = useSettings()
    expect(isLoaded.value).toBe(false)
  })

  it('starts with storageEncrypted = true', () => {
    const { storageEncrypted } = useSettings()
    expect(storageEncrypted.value).toBe(true)
  })

  it('starts with the fallback realtime models list', () => {
    const { realtimeModels } = useSettings()
    expect(realtimeModels.value.length).toBeGreaterThan(0)
    expect(realtimeModels.value[0].id).toContain('realtime')
  })

  it('starts with modelsLoading = false', () => {
    const { modelsLoading } = useSettings()
    expect(modelsLoading.value).toBe(false)
  })

  // ── load() ─────────────────────────────────────────────────────────────────

  it('calls window.electronAPI.loadApiKey', async () => {
    globalThis.fetch = mockFetch([])
    window.electronAPI.loadApiKey = vi.fn().mockResolvedValue({ key: null, encrypted: true })
    const { load } = useSettings()
    await load()
    expect(window.electronAPI.loadApiKey).toHaveBeenCalledTimes(1)
  })

  it('populates apiKey when the stored key is non-null', async () => {
    globalThis.fetch = mockFetch([])
    window.electronAPI.loadApiKey = vi.fn().mockResolvedValue({ key: 'sk-saved', encrypted: true })
    const { apiKey, load } = useSettings()
    await load()
    expect(apiKey.value).toBe('sk-saved')
  })

  it('leaves apiKey empty when stored key is null', async () => {
    window.electronAPI.loadApiKey = vi.fn().mockResolvedValue({ key: null, encrypted: true })
    const { apiKey, load } = useSettings()
    await load()
    expect(apiKey.value).toBe('')
  })

  it('sets storageEncrypted from the API response', async () => {
    window.electronAPI.loadApiKey = vi.fn().mockResolvedValue({ key: null, encrypted: false })
    const { storageEncrypted, load } = useSettings()
    await load()
    expect(storageEncrypted.value).toBe(false)
  })

  it('sets isLoaded to true after loading', async () => {
    window.electronAPI.loadApiKey = vi.fn().mockResolvedValue({ key: null, encrypted: true })
    const { isLoaded, load } = useSettings()
    await load()
    expect(isLoaded.value).toBe(true)
  })

  it('does not call the API a second time if already loaded', async () => {
    const loadApiKey = vi.fn().mockResolvedValue({ key: null, encrypted: true })
    window.electronAPI.loadApiKey = loadApiKey
    const { load } = useSettings()
    await load()
    await load()
    expect(loadApiKey).toHaveBeenCalledTimes(1)
  })

  it('fetches models from OpenAI when a key is loaded', async () => {
    globalThis.fetch = mockFetch([{ id: 'gpt-4o-realtime-preview' }])
    window.electronAPI.loadApiKey = vi.fn().mockResolvedValue({ key: 'sk-abc', encrypted: true })
    const { load } = useSettings()
    await load()
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({ headers: { Authorization: 'Bearer sk-abc' } })
    )
  })

  it('does not fetch models when no key is loaded', async () => {
    globalThis.fetch = mockFetch([])
    window.electronAPI.loadApiKey = vi.fn().mockResolvedValue({ key: null, encrypted: true })
    const { load } = useSettings()
    await load()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  // ── save() ─────────────────────────────────────────────────────────────────

  it('calls window.electronAPI.saveApiKey with the current apiKey in the credentials blob', async () => {
    globalThis.fetch = mockFetch([])
    window.electronAPI.saveApiKey = vi.fn().mockResolvedValue({ success: true })
    const { apiKey, save } = useSettings()
    apiKey.value = 'sk-tobeSaved'
    await save()
    const raw = (window.electronAPI.saveApiKey as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(JSON.parse(raw).openaiKey).toBe('sk-tobeSaved')
  })

  it('trims the apiKey before saving', async () => {
    globalThis.fetch = mockFetch([])
    window.electronAPI.saveApiKey = vi.fn().mockResolvedValue({ success: true })
    const { apiKey, save } = useSettings()
    apiKey.value = '  sk-padded  '
    await save()
    const raw = (window.electronAPI.saveApiKey as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(JSON.parse(raw).openaiKey).toBe('sk-padded')
    expect(apiKey.value).toBe('sk-padded')
  })

  it('calls saveApiKey with an empty openaiKey when apiKey is empty', async () => {
    window.electronAPI.saveApiKey = vi.fn().mockResolvedValue({ success: true })
    const { save } = useSettings()
    await save()
    const raw = (window.electronAPI.saveApiKey as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(JSON.parse(raw).openaiKey).toBe('')
  })

  it('fetches models after saving (when provider is openai)', async () => {
    globalThis.fetch = mockFetch([{ id: 'gpt-4o-realtime-preview' }])
    window.electronAPI.saveApiKey = vi.fn().mockResolvedValue({ success: true })
    const { apiKey, save } = useSettings()
    apiKey.value = 'sk-new'
    await save()
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.anything()
    )
  })

  // ── fetchModels() ──────────────────────────────────────────────────────────

  it('updates realtimeModels with realtime-filtered results from OpenAI', async () => {
    globalThis.fetch = mockFetch([
      { id: 'gpt-4o' },
      { id: 'gpt-4o-realtime-preview' },
      { id: 'gpt-4o-mini-realtime-preview' },
      { id: 'whisper-1' }
    ])
    const { apiKey, realtimeModels, fetchModels } = useSettings()
    apiKey.value = 'sk-abc'
    await fetchModels()
    expect(realtimeModels.value.map(m => m.id)).toEqual([
      'gpt-4o-mini-realtime-preview',
      'gpt-4o-realtime-preview'
    ])
  })

  it('appends "(latest)" to undated model IDs', async () => {
    globalThis.fetch = mockFetch([{ id: 'gpt-4o-realtime-preview' }])
    const { apiKey, realtimeModels, fetchModels } = useSettings()
    apiKey.value = 'sk-abc'
    await fetchModels()
    expect(realtimeModels.value[0].label).toContain('(latest)')
  })

  it('does not append "(latest)" to dated model IDs', async () => {
    globalThis.fetch = mockFetch([{ id: 'gpt-4o-realtime-preview-2024-12-17' }])
    const { apiKey, realtimeModels, fetchModels } = useSettings()
    apiKey.value = 'sk-abc'
    await fetchModels()
    expect(realtimeModels.value[0].label).not.toContain('(latest)')
  })

  it('keeps existing models when the API returns no realtime models', async () => {
    globalThis.fetch = mockFetch([{ id: 'gpt-4o' }, { id: 'whisper-1' }])
    const { apiKey, realtimeModels, fetchModels } = useSettings()
    apiKey.value = 'sk-abc'
    const before = realtimeModels.value.map(m => m.id)
    await fetchModels()
    expect(realtimeModels.value.map(m => m.id)).toEqual(before)
  })

  it('keeps existing models when the API returns data: null', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: null })
    })
    const { apiKey, realtimeModels, fetchModels } = useSettings()
    apiKey.value = 'sk-abc'
    const before = realtimeModels.value.map(m => m.id)
    await fetchModels()
    expect(realtimeModels.value.map(m => m.id)).toEqual(before)
  })

  it('keeps existing models when the API response is missing the data field', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({})
    })
    const { apiKey, realtimeModels, fetchModels } = useSettings()
    apiKey.value = 'sk-abc'
    const before = realtimeModels.value.map(m => m.id)
    await fetchModels()
    expect(realtimeModels.value.map(m => m.id)).toEqual(before)
  })

  it('keeps existing models when the fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))
    const { apiKey, realtimeModels, fetchModels } = useSettings()
    apiKey.value = 'sk-abc'
    const before = realtimeModels.value.map(m => m.id)
    await fetchModels()
    expect(realtimeModels.value.map(m => m.id)).toEqual(before)
  })

  it('keeps existing models when the API returns a non-OK response', async () => {
    globalThis.fetch = mockFetch([], false)
    const { apiKey, realtimeModels, fetchModels } = useSettings()
    apiKey.value = 'sk-abc'
    const before = realtimeModels.value.map(m => m.id)
    await fetchModels()
    expect(realtimeModels.value.map(m => m.id)).toEqual(before)
  })

  it('does nothing when apiKey is empty', async () => {
    globalThis.fetch = mockFetch([{ id: 'gpt-4o-realtime-preview' }])
    const { fetchModels } = useSettings()
    await fetchModels()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('resets model selection to first available if current model is no longer in list', async () => {
    globalThis.fetch = mockFetch([{ id: 'gpt-4o-mini-realtime-preview' }])
    const { apiKey, model, fetchModels } = useSettings()
    apiKey.value = 'sk-abc'
    model.value = 'gpt-4o-realtime-preview' // not in fetched list
    await fetchModels()
    expect(model.value).toBe('gpt-4o-mini-realtime-preview')
  })

  // ── Provider selection ─────────────────────────────────────────────────────

  it('starts with provider = "openai"', () => {
    const { provider } = useSettings()
    expect(provider.value).toBe('openai')
  })

  it('starts with empty geminiApiKey', () => {
    const { geminiApiKey } = useSettings()
    expect(geminiApiKey.value).toBe('')
  })

  it('starts with empty awsAccessKeyId', () => {
    const { awsAccessKeyId } = useSettings()
    expect(awsAccessKeyId.value).toBe('')
  })

  it('starts with awsRegion = "us-east-1"', () => {
    const { awsRegion } = useSettings()
    expect(awsRegion.value).toBe('us-east-1')
  })

  // ── save() credentials blob ────────────────────────────────────────────────

  it('save() serialises credentials as a v1 JSON blob', async () => {
    window.electronAPI.saveApiKey = vi.fn().mockResolvedValue({ success: true })
    const { save } = useSettings()
    await save()
    const raw = (window.electronAPI.saveApiKey as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    const blob = JSON.parse(raw)
    expect(blob.v).toBe(1)
    expect(blob).toHaveProperty('provider')
    expect(blob).toHaveProperty('openaiKey')
  })

  it('save() includes geminiKey in the blob', async () => {
    window.electronAPI.saveApiKey = vi.fn().mockResolvedValue({ success: true })
    const { geminiApiKey, save } = useSettings()
    geminiApiKey.value = 'AIza-test'
    await save()
    const raw = (window.electronAPI.saveApiKey as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(JSON.parse(raw).geminiKey).toBe('AIza-test')
  })

  it('save() includes awsAccessKeyId, awsSecretAccessKey, awsRegion in the blob', async () => {
    window.electronAPI.saveApiKey = vi.fn().mockResolvedValue({ success: true })
    const { awsAccessKeyId, awsSecretAccessKey, awsRegion, save } = useSettings()
    awsAccessKeyId.value = 'AKIATEST'
    awsSecretAccessKey.value = 'secret'
    awsRegion.value = 'eu-west-1'
    await save()
    const raw = (window.electronAPI.saveApiKey as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    const blob = JSON.parse(raw)
    expect(blob.awsAccessKeyId).toBe('AKIATEST')
    expect(blob.awsSecretAccessKey).toBe('secret')
    expect(blob.awsRegion).toBe('eu-west-1')
  })

  it('save() includes the active provider in the blob', async () => {
    window.electronAPI.saveApiKey = vi.fn().mockResolvedValue({ success: true })
    const { provider, save } = useSettings()
    provider.value = 'gemini'
    await save()
    const raw = (window.electronAPI.saveApiKey as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(JSON.parse(raw).provider).toBe('gemini')
  })

  // ── load() with v1 credentials blob ────────────────────────────────────────

  it('load() hydrates all credential fields from a v1 blob', async () => {
    const blob = {
      v: 1, provider: 'gemini',
      openaiKey: 'sk-x', geminiKey: 'AIza-x',
      awsAccessKeyId: 'AKI', awsSecretAccessKey: 'sec',
      awsSessionToken: 'tok', awsRegion: 'ap-southeast-1',
      model: 'gpt-4o-realtime-preview', outputMode: 'audio',
      audioTimeoutSeconds: 10, systemPrompt: 'Test prompt'
    }
    window.electronAPI.loadApiKey = vi.fn().mockResolvedValue({ key: JSON.stringify(blob), encrypted: true })
    const { load, provider, apiKey, geminiApiKey, awsAccessKeyId, awsRegion, outputMode } = useSettings()
    await load()
    expect(provider.value).toBe('gemini')
    expect(apiKey.value).toBe('sk-x')
    expect(geminiApiKey.value).toBe('AIza-x')
    expect(awsAccessKeyId.value).toBe('AKI')
    expect(awsRegion.value).toBe('ap-southeast-1')
    expect(outputMode.value).toBe('audio')
  })

  it('load() treats a non-JSON stored value as a legacy OpenAI key', async () => {
    window.electronAPI.loadApiKey = vi.fn().mockResolvedValue({ key: 'sk-legacy', encrypted: true })
    const { load, provider, apiKey } = useSettings()
    await load()
    expect(provider.value).toBe('openai')
    expect(apiKey.value).toBe('sk-legacy')
  })

  it('load() does not call OpenAI models API when provider is gemini', async () => {
    globalThis.fetch = vi.fn()
    const blob = { v: 1, provider: 'gemini', openaiKey: '', geminiKey: 'AIza-x',
      awsAccessKeyId: '', awsSecretAccessKey: '', awsSessionToken: '', awsRegion: 'us-east-1',
      model: 'gpt-4o-realtime-preview', outputMode: 'text', audioTimeoutSeconds: 5, systemPrompt: '' }
    window.electronAPI.loadApiKey = vi.fn().mockResolvedValue({ key: JSON.stringify(blob), encrypted: true })
    const { load } = useSettings()
    await load()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('fetchModels() does nothing when provider is gemini', async () => {
    globalThis.fetch = vi.fn()
    const { provider, apiKey, fetchModels } = useSettings()
    provider.value = 'gemini'
    apiKey.value = 'AIza-x'
    await fetchModels()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('fetchModels() does nothing when provider is nova-sonic', async () => {
    globalThis.fetch = vi.fn()
    const { provider, fetchModels } = useSettings()
    provider.value = 'nova-sonic'
    await fetchModels()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  // ── analysisModel / analysisModels ─────────────────────────────────────────

  it('starts with analysisModel set to the first fallback analysis model', () => {
    const { analysisModel } = useSettings()
    expect(analysisModel.value).toBe('gpt-4.1')
  })

  it('starts with fallback analysisModels list', () => {
    const { analysisModels } = useSettings()
    expect(analysisModels.value.length).toBeGreaterThan(0)
    expect(analysisModels.value[0].id).toBe('gpt-4.1')
  })

  it('fetchModels() populates analysisModels with gpt- non-realtime models', async () => {
    globalThis.fetch = mockFetch([
      { id: 'gpt-4.1' },
      { id: 'gpt-4o' },
      { id: 'gpt-4o-mini' },
      { id: 'gpt-4o-realtime-preview' },
      { id: 'whisper-1' }
    ])
    const { apiKey, analysisModels, fetchModels } = useSettings()
    apiKey.value = 'sk-abc'
    await fetchModels()
    const ids = analysisModels.value.map(m => m.id)
    expect(ids).toContain('gpt-4.1')
    expect(ids).toContain('gpt-4o')
    expect(ids).not.toContain('gpt-4o-realtime-preview')
    expect(ids).not.toContain('whisper-1')
  })

  it('fetchModels() resets analysisModel to first available if current is not in list', async () => {
    globalThis.fetch = mockFetch([{ id: 'gpt-4o-mini' }, { id: 'gpt-4o-realtime-preview' }])
    const { apiKey, analysisModel, fetchModels } = useSettings()
    apiKey.value = 'sk-abc'
    analysisModel.value = 'gpt-4.1' // not in fetched list
    await fetchModels()
    expect(analysisModel.value).toBe('gpt-4o-mini')
  })

  it('save() includes analysisModel in the blob', async () => {
    window.electronAPI.saveApiKey = vi.fn().mockResolvedValue({ success: true })
    const { analysisModel, save } = useSettings()
    analysisModel.value = 'gpt-4o'
    await save()
    const raw = (window.electronAPI.saveApiKey as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    const blob = JSON.parse(raw)
    expect(blob.analysisModel).toBe('gpt-4o')
  })

  it('starts with analysisWindowSeconds = 30', () => {
    const { analysisWindowSeconds } = useSettings()
    expect(analysisWindowSeconds.value).toBe(30)
  })

  it('save() includes analysisWindowSeconds in the blob', async () => {
    window.electronAPI.saveApiKey = vi.fn().mockResolvedValue({ success: true })
    const { analysisWindowSeconds, save } = useSettings()
    analysisWindowSeconds.value = 45
    await save()
    const raw = (window.electronAPI.saveApiKey as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(JSON.parse(raw).analysisWindowSeconds).toBe(45)
  })

  it('load() restores analysisModel from the blob', async () => {
    const blob = {
      v: 1, provider: 'openai', openaiKey: 'sk-x', geminiKey: '',
      awsAccessKeyId: '', awsSecretAccessKey: '', awsSessionToken: '',
      awsRegion: 'us-east-1', model: 'gpt-4o-realtime-preview',
      analysisModel: 'gpt-4o-mini', analysisWindowSeconds: 45,
      outputMode: 'text', audioTimeoutSeconds: 5, systemPrompt: ''
    }
    window.electronAPI.loadApiKey = vi.fn().mockResolvedValue({ key: JSON.stringify(blob), encrypted: true })
    const { analysisModel, analysisWindowSeconds, load } = useSettings()
    await load()
    expect(analysisModel.value).toBe('gpt-4o-mini')
    expect(analysisWindowSeconds.value).toBe(45)
  })

  it('load() clamps analysisWindowSeconds to [20, 60]', async () => {
    const blob = {
      v: 1, provider: 'openai', openaiKey: 'sk-x', geminiKey: '',
      awsAccessKeyId: '', awsSecretAccessKey: '', awsSessionToken: '',
      awsRegion: 'us-east-1', model: 'gpt-4o-realtime-preview',
      analysisModel: 'gpt-4.1', analysisWindowSeconds: 5,
      outputMode: 'text', audioTimeoutSeconds: 5, systemPrompt: ''
    }
    window.electronAPI.loadApiKey = vi.fn().mockResolvedValue({ key: JSON.stringify(blob), encrypted: true })
    const { analysisWindowSeconds, load } = useSettings()
    await load()
    expect(analysisWindowSeconds.value).toBe(20)
  })
})
