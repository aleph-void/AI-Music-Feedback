import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

// ── Mock composable ────────────────────────────────────────────────────────
// We must NOT call ref() inside vi.hoisted — vue is not imported yet when
// hoisted callbacks run. Instead, we create a fresh state object in beforeEach
// so useSettings() (called lazily inside component setup) always gets the
// current state.

const MOCK_MODELS = [
  { id: 'gpt-4o-realtime-preview', label: 'gpt-4o-realtime-preview (latest)' },
  { id: 'gpt-4o-mini-realtime-preview', label: 'gpt-4o-mini-realtime-preview (latest)' }
]

let mockState: {
  apiKey: ReturnType<typeof ref<string>>
  model: ReturnType<typeof ref<string>>
  outputMode: ReturnType<typeof ref<string>>
  audioTimeoutSeconds: ReturnType<typeof ref<number>>
  systemPrompt: ReturnType<typeof ref<string>>
  realtimeModels: ReturnType<typeof ref<typeof MOCK_MODELS>>
  modelsLoading: ReturnType<typeof ref<boolean>>
  storageEncrypted: ReturnType<typeof ref<boolean>>
  isLoaded: ReturnType<typeof ref<boolean>>
  load: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
  fetchModels: ReturnType<typeof vi.fn>
}

function createMockState() {
  return {
    apiKey: ref(''),
    model: ref('gpt-4o-realtime-preview'),
    outputMode: ref('text'),
    audioTimeoutSeconds: ref(5),
    systemPrompt: ref('default system prompt'),
    realtimeModels: ref(MOCK_MODELS),
    modelsLoading: ref(false),
    storageEncrypted: ref(true),
    isLoaded: ref(true),
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    fetchModels: vi.fn().mockResolvedValue(undefined)
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

  // ── System prompt character counter ───────────────────────────────────────

  it('renders a character count for the system prompt', () => {
    const w = mountPanel()
    expect(w.find('.char-count').exists()).toBe(true)
  })

  it('character count reflects the current prompt length', () => {
    mockState.systemPrompt.value = 'hello'
    const w = mountPanel()
    expect(w.find('.char-count').text()).toContain('5')
  })

  it('does not show the over-limit warning when prompt is short', () => {
    mockState.systemPrompt.value = 'short'
    const w = mountPanel()
    expect(w.find('.warning').exists()).toBe(false)
  })

  it('shows over-limit warning when system prompt exceeds 4000 chars', () => {
    mockState.systemPrompt.value = 'a'.repeat(4001)
    const w = mountPanel()
    expect(w.find('.warning').exists()).toBe(true)
    expect(w.find('.warning').text()).toContain('4000')
  })

  it('char-count has "over" class when prompt exceeds 4000 chars', () => {
    mockState.systemPrompt.value = 'a'.repeat(4001)
    const w = mountPanel()
    expect(w.find('.char-count').classes()).toContain('over')
  })

  it('char-count has "warn" class when prompt is between 3000 and 4000 chars', () => {
    mockState.systemPrompt.value = 'a'.repeat(3500)
    const w = mountPanel()
    expect(w.find('.char-count').classes()).toContain('warn')
    expect(w.find('.char-count').classes()).not.toContain('over')
  })

  // ── Language selector ──────────────────────────────────────────────────────

  it('renders a language select dropdown', () => {
    const w = mountPanel()
    expect(w.find('#language').exists()).toBe(true)
  })

  it('language dropdown has at least one option', () => {
    const w = mountPanel()
    const options = w.find('#language').findAll('option')
    expect(options.length).toBeGreaterThanOrEqual(1)
  })

  it('language dropdown contains an English option', () => {
    const w = mountPanel()
    const options = w.find('#language').findAll('option')
    const texts = options.map(o => o.text())
    expect(texts).toContain('English')
  })

  it('language dropdown defaults to English', () => {
    const w = mountPanel()
    const select = w.find('#language').element as HTMLSelectElement
    expect(select.value).toBe('en')
  })

  it('options are driven by available locale files', () => {
    const w = mountPanel()
    // Each option value must be a locale code (non-empty string)
    const options = w.find('#language').findAll('option')
    options.forEach(o => expect(o.attributes('value')).toBeTruthy())
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

  it('save button is re-enabled after save completes', async () => {
    let resolve!: () => void
    mockState.save.mockReturnValue(new Promise<void>(r => { resolve = r }))
    const w = mountPanel()
    w.find('.primary-btn').trigger('click')
    await w.vm.$nextTick()
    expect((w.find('.primary-btn').element as HTMLButtonElement).disabled).toBe(true)
    resolve()
    await w.vm.$nextTick()
    expect((w.find('.primary-btn').element as HTMLButtonElement).disabled).toBe(false)
  })

  // ── API key format validation ──────────────────────────────────────────────

  it('shows a format error when apiKey does not start with "sk-"', () => {
    mockState.apiKey.value = 'not-a-valid-key'
    const w = mountPanel()
    expect(w.find('.warning').exists()).toBe(true)
    expect(w.find('.warning').text()).toContain('sk-')
  })

  it('shows a format error for uppercase "SK-" prefix', () => {
    // sk- check is case-sensitive — SK- is not a valid OpenAI key format
    mockState.apiKey.value = 'SK-UPPERCASE123'
    const w = mountPanel()
    expect(w.find('.warning').exists()).toBe(true)
  })

  it('does not show a format error for a key that is exactly "sk-" (valid prefix)', () => {
    // The format check only requires the sk- prefix; trailing content is not required
    mockState.apiKey.value = 'sk-'
    const w = mountPanel()
    expect(w.find('.warning').exists()).toBe(false)
  })

  it('does not show a format error when apiKey is empty', () => {
    mockState.apiKey.value = ''
    const w = mountPanel()
    expect(w.find('.warning').exists()).toBe(false)
  })

  it('strips internal whitespace before validating — "sk- test" passes', () => {
    // The computed strips all whitespace before checking startsWith('sk-'),
    // so 'sk- test' becomes 'sk-test' which is valid.
    mockState.apiKey.value = 'sk- test'
    const w = mountPanel()
    expect(w.find('.warning').exists()).toBe(false)
  })

  // ── Output mode toggle ─────────────────────────────────────────────────────

  it('text mode button has the "active" class by default', () => {
    mockState.outputMode.value = 'text'
    const w = mountPanel()
    const [textBtn, audioBtn] = w.findAll('.mode-btn')
    expect(textBtn.classes()).toContain('active')
    expect(audioBtn.classes()).not.toContain('active')
  })

  it('audio mode button has the "active" class when outputMode is audio', () => {
    mockState.outputMode.value = 'audio'
    const w = mountPanel()
    const [textBtn, audioBtn] = w.findAll('.mode-btn')
    expect(audioBtn.classes()).toContain('active')
    expect(textBtn.classes()).not.toContain('active')
  })

  it('clicking audio button sets outputMode to "audio"', async () => {
    const w = mountPanel()
    const [, audioBtn] = w.findAll('.mode-btn')
    await audioBtn.trigger('click')
    expect(mockState.outputMode.value).toBe('audio')
  })

  it('clicking text button sets outputMode to "text"', async () => {
    mockState.outputMode.value = 'audio'
    const w = mountPanel()
    const [textBtn] = w.findAll('.mode-btn')
    await textBtn.trigger('click')
    expect(mockState.outputMode.value).toBe('text')
  })

  it('audio warning is hidden when outputMode is text', () => {
    mockState.outputMode.value = 'text'
    const w = mountPanel()
    expect(w.find('.audio-warning').exists()).toBe(false)
  })

  it('audio warning is visible when outputMode is audio', () => {
    mockState.outputMode.value = 'audio'
    const w = mountPanel()
    expect(w.find('.audio-warning').exists()).toBe(true)
    expect(w.find('.audio-warning').text()).toContain('token')
  })

  it('switching from text to audio shows the warning', async () => {
    const w = mountPanel()
    expect(w.find('.audio-warning').exists()).toBe(false)
    await w.findAll('.mode-btn')[1].trigger('click')
    expect(w.find('.audio-warning').exists()).toBe(true)
  })

  // ── Model refresh button state ─────────────────────────────────────────────

  it('refresh button is disabled when apiKey is empty', () => {
    mockState.apiKey.value = ''
    const w = mountPanel()
    const refreshBtn = w.find('[title="Refresh model list from OpenAI"]')
    expect((refreshBtn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('refresh button is enabled when apiKey is set and not loading', () => {
    mockState.apiKey.value = 'sk-validkey'
    mockState.modelsLoading.value = false
    const w = mountPanel()
    const refreshBtn = w.find('[title="Refresh model list from OpenAI"]')
    expect((refreshBtn.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('refresh button is disabled while modelsLoading is true', () => {
    mockState.apiKey.value = 'sk-validkey'
    mockState.modelsLoading.value = true
    const w = mountPanel()
    const refreshBtn = w.find('[title="Refresh model list from OpenAI"]')
    expect((refreshBtn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('refresh button shows "…" while loading', () => {
    mockState.modelsLoading.value = true
    const w = mountPanel()
    const refreshBtn = w.find('[title="Refresh model list from OpenAI"]')
    expect(refreshBtn.text()).toBe('…')
  })

  it('refresh button shows "↻" when not loading', () => {
    mockState.modelsLoading.value = false
    const w = mountPanel()
    const refreshBtn = w.find('[title="Refresh model list from OpenAI"]')
    expect(refreshBtn.text()).toBe('↻')
  })

  it('clicking the refresh button calls fetchModels', async () => {
    mockState.apiKey.value = 'sk-validkey'
    const w = mountPanel()
    await w.find('[title="Refresh model list from OpenAI"]').trigger('click')
    expect(mockState.fetchModels).toHaveBeenCalledTimes(1)
  })
})
