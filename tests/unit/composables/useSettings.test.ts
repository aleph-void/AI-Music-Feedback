import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { useSettings as UseSettingsFn } from '@/composables/useSettings'

// Composable has module-level state — re-import fresh each test via resetModules
let useSettings: typeof UseSettingsFn

beforeEach(async () => {
  vi.resetModules()
  const mod = await import('@/composables/useSettings')
  useSettings = mod.useSettings
})

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

  // ── load() ─────────────────────────────────────────────────────────────────

  it('calls window.electronAPI.loadApiKey', async () => {
    window.electronAPI.loadApiKey = vi.fn().mockResolvedValue({ key: null, encrypted: true })
    const { load } = useSettings()
    await load()
    expect(window.electronAPI.loadApiKey).toHaveBeenCalledTimes(1)
  })

  it('populates apiKey when the stored key is non-null', async () => {
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

  // ── save() ─────────────────────────────────────────────────────────────────

  it('calls window.electronAPI.saveApiKey with the current apiKey', async () => {
    window.electronAPI.saveApiKey = vi.fn().mockResolvedValue({ success: true })
    const { apiKey, save } = useSettings()
    apiKey.value = 'sk-tobeSaved'
    await save()
    expect(window.electronAPI.saveApiKey).toHaveBeenCalledWith('sk-tobeSaved')
  })

  it('calls saveApiKey with an empty string when apiKey is empty', async () => {
    window.electronAPI.saveApiKey = vi.fn().mockResolvedValue({ success: true })
    const { save } = useSettings()
    await save()
    expect(window.electronAPI.saveApiKey).toHaveBeenCalledWith('')
  })
})
