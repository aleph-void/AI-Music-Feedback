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

  it('calls window.electronAPI.saveApiKey with the current apiKey', async () => {
    globalThis.fetch = mockFetch([])
    window.electronAPI.saveApiKey = vi.fn().mockResolvedValue({ success: true })
    const { apiKey, save } = useSettings()
    apiKey.value = 'sk-tobeSaved'
    await save()
    expect(window.electronAPI.saveApiKey).toHaveBeenCalledWith('sk-tobeSaved')
  })

  it('trims the apiKey before saving', async () => {
    globalThis.fetch = mockFetch([])
    window.electronAPI.saveApiKey = vi.fn().mockResolvedValue({ success: true })
    const { apiKey, save } = useSettings()
    apiKey.value = '  sk-padded  '
    await save()
    expect(window.electronAPI.saveApiKey).toHaveBeenCalledWith('sk-padded')
    expect(apiKey.value).toBe('sk-padded')
  })

  it('calls saveApiKey with an empty string when apiKey is empty', async () => {
    window.electronAPI.saveApiKey = vi.fn().mockResolvedValue({ success: true })
    const { save } = useSettings()
    await save()
    expect(window.electronAPI.saveApiKey).toHaveBeenCalledWith('')
  })

  it('fetches models after saving', async () => {
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
})
