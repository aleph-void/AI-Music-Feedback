import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

// ── Mock composable ────────────────────────────────────────────────────────
// We must NOT call ref() inside vi.hoisted — vue is not imported yet when
// hoisted callbacks run. Instead, we create a fresh state object in beforeEach
// so useSettings() (called lazily inside component setup) always gets the
// current state.

let mockState: {
  apiKey: ReturnType<typeof ref<string>>
  systemPrompt: ReturnType<typeof ref<string>>
  storageEncrypted: ReturnType<typeof ref<boolean>>
  isLoaded: ReturnType<typeof ref<boolean>>
  load: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
}

function createMockState() {
  return {
    apiKey: ref(''),
    systemPrompt: ref('default system prompt'),
    storageEncrypted: ref(true),
    isLoaded: ref(true),
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined)
  }
}

// Factory reads mockState lazily — setup() calls useSettings() at mount time,
// which is after beforeEach has set a fresh mockState.
vi.mock('@/composables/useSettings', () => ({
  useSettings: () => mockState
}))

import SettingsPanel from '@/components/SettingsPanel.vue'

beforeEach(() => {
  vi.clearAllMocks()
  mockState = createMockState()
})

describe('SettingsPanel', () => {
  function mountPanel() {
    return mount(SettingsPanel, { attachTo: document.body })
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the Settings heading', () => {
    const w = mountPanel()
    expect(w.find('h2').text()).toBe('Settings')
  })

  it('renders the API key input as type="password" by default', () => {
    const w = mountPanel()
    expect(w.find('#api-key').attributes('type')).toBe('password')
  })

  it('renders the system prompt textarea', () => {
    const w = mountPanel()
    expect(w.find('#system-prompt').exists()).toBe(true)
  })

  it('system prompt textarea reflects the composable value', () => {
    mockState.systemPrompt.value = 'my custom prompt'
    const w = mountPanel()
    expect((w.find('#system-prompt').element as HTMLTextAreaElement).value).toBe('my custom prompt')
  })

  it('renders the Save Settings button', () => {
    const w = mountPanel()
    expect(w.find('.primary-btn').text()).toBe('Save Settings')
  })

  it('does not show the unencrypted warning when storage is encrypted', () => {
    mockState.storageEncrypted.value = true
    const w = mountPanel()
    expect(w.find('.warning').exists()).toBe(false)
  })

  it('shows the unencrypted warning when storageEncrypted is false', () => {
    mockState.storageEncrypted.value = false
    const w = mountPanel()
    expect(w.find('.warning').exists()).toBe(true)
    expect(w.find('.warning').text()).toContain('plain text')
  })

  it('does not show Saved! message initially', () => {
    const w = mountPanel()
    expect(w.find('.saved-msg').exists()).toBe(false)
  })

  // ── API key visibility toggle ──────────────────────────────────────────────

  it('toggles input type to "text" when the eye button is clicked', async () => {
    const w = mountPanel()
    await w.find('.icon-btn').trigger('click')
    expect(w.find('#api-key').attributes('type')).toBe('text')
  })

  it('toggles input back to "password" on second click', async () => {
    const w = mountPanel()
    await w.find('.icon-btn').trigger('click')
    await w.find('.icon-btn').trigger('click')
    expect(w.find('#api-key').attributes('type')).toBe('password')
  })

  it('changes button title from "Show" to "Hide" when revealed', async () => {
    const w = mountPanel()
    expect(w.find('.icon-btn').attributes('title')).toBe('Show')
    await w.find('.icon-btn').trigger('click')
    expect(w.find('.icon-btn').attributes('title')).toBe('Hide')
  })

  // ── Save interaction ───────────────────────────────────────────────────────

  it('calls the composable save() when Save Settings is clicked', async () => {
    const w = mountPanel()
    await w.find('.primary-btn').trigger('click')
    expect(mockState.save).toHaveBeenCalledTimes(1)
  })

  it('shows "Saved!" after successful save', async () => {
    const w = mountPanel()
    await w.find('.primary-btn').trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.saved-msg').exists()).toBe(true)
    expect(w.find('.saved-msg').text()).toBe('Saved!')
  })

  it('button shows "Saving..." while the save is in progress', async () => {
    let resolve!: () => void
    mockState.save.mockReturnValue(new Promise<void>(r => { resolve = r }))
    const w = mountPanel()
    w.find('.primary-btn').trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.primary-btn').text()).toBe('Saving...')
    resolve()
  })

  it('save button is disabled while saving', async () => {
    let resolve!: () => void
    mockState.save.mockReturnValue(new Promise<void>(r => { resolve = r }))
    const w = mountPanel()
    w.find('.primary-btn').trigger('click')
    await w.vm.$nextTick()
    expect((w.find('.primary-btn').element as HTMLButtonElement).disabled).toBe(true)
    resolve()
  })
})
