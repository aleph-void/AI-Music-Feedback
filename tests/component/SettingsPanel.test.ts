import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
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

const MOCK_ANALYSIS_MODELS = [
  { id: 'gpt-4.1', label: 'gpt-4.1' },
  { id: 'gpt-4o', label: 'gpt-4o (latest)' },
  { id: 'gpt-4o-mini', label: 'gpt-4o-mini' }
]

const MOCK_GEMINI_ANALYSIS_MODELS = [
  { id: 'gemini-2.5-flash-preview', label: 'gemini-2.5-flash-preview' },
  { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash' }
]

let mockState: {
  provider: ReturnType<typeof ref<string>>
  apiKey: ReturnType<typeof ref<string>>
  geminiApiKey: ReturnType<typeof ref<string>>
  awsAccessKeyId: ReturnType<typeof ref<string>>
  awsSecretAccessKey: ReturnType<typeof ref<string>>
  awsSessionToken: ReturnType<typeof ref<string>>
  awsRegion: ReturnType<typeof ref<string>>
  model: ReturnType<typeof ref<string>>
  analysisModel: ReturnType<typeof ref<string>>
  analysisWindowSeconds: ReturnType<typeof ref<number>>
  outputMode: ReturnType<typeof ref<string>>
  audioTimeoutSeconds: ReturnType<typeof ref<number>>
  systemPrompt: ReturnType<typeof ref<string>>
  realtimeModels: ReturnType<typeof ref<typeof MOCK_MODELS>>
  analysisModels: ReturnType<typeof ref<typeof MOCK_ANALYSIS_MODELS>>
  geminiAnalysisModel: ReturnType<typeof ref<string>>
  geminiAnalysisModels: ReturnType<typeof ref<typeof MOCK_GEMINI_ANALYSIS_MODELS>>
  modelsLoading: ReturnType<typeof ref<boolean>>
  storageEncrypted: ReturnType<typeof ref<boolean>>
  isLoaded: ReturnType<typeof ref<boolean>>
  load: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
  fetchModels: ReturnType<typeof vi.fn>
}

function createMockState() {
  return {
    provider: ref('openai'),
    apiKey: ref(''),
    geminiApiKey: ref(''),
    awsAccessKeyId: ref(''),
    awsSecretAccessKey: ref(''),
    awsSessionToken: ref(''),
    awsRegion: ref('us-east-1'),
    model: ref('gpt-4o-realtime-preview'),
    analysisModel: ref('gpt-4.1'),
    analysisWindowSeconds: ref(30),
    outputMode: ref('text'),
    audioTimeoutSeconds: ref(5),
    systemPrompt: ref('default system prompt'),
    realtimeModels: ref(MOCK_MODELS),
    analysisModels: ref(MOCK_ANALYSIS_MODELS),
    geminiAnalysisModel: ref('gemini-2.5-flash-preview'),
    geminiAnalysisModels: ref(MOCK_GEMINI_ANALYSIS_MODELS),
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
    await flushPromises()
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

  // ── Provider selector ──────────────────────────────────────────────────────

  it('renders a #provider select dropdown', () => {
    const w = mountPanel()
    expect(w.find('#provider').exists()).toBe(true)
  })

  it('#provider dropdown has 3 options (openai, gemini, nova-sonic)', () => {
    const w = mountPanel()
    const options = w.find('#provider').findAll('option')
    const values = options.map(o => o.attributes('value'))
    expect(values).toContain('openai')
    expect(values).toContain('gemini')
    expect(values).toContain('nova-sonic')
    expect(options.length).toBe(3)
  })

  it('#provider defaults to "openai"', () => {
    const w = mountPanel()
    expect((w.find('#provider').element as HTMLSelectElement).value).toBe('openai')
  })

  // ── OpenAI conditional section ─────────────────────────────────────────────

  it('renders #api-key when provider is openai', () => {
    mockState.provider.value = 'openai'
    const w = mountPanel()
    expect(w.find('#api-key').exists()).toBe(true)
  })

  it('hides #api-key when provider is gemini', () => {
    mockState.provider.value = 'gemini'
    const w = mountPanel()
    expect(w.find('#api-key').exists()).toBe(false)
  })

  it('hides #api-key when provider is nova-sonic', () => {
    mockState.provider.value = 'nova-sonic'
    const w = mountPanel()
    expect(w.find('#api-key').exists()).toBe(false)
  })

  it('renders #model select when provider is openai', () => {
    mockState.provider.value = 'openai'
    const w = mountPanel()
    expect(w.find('#model').exists()).toBe(true)
  })

  it('hides #model select when provider is gemini', () => {
    mockState.provider.value = 'gemini'
    const w = mountPanel()
    expect(w.find('#model').exists()).toBe(false)
  })

  it('shows format error for invalid openai key when provider is openai', () => {
    mockState.provider.value = 'openai'
    mockState.apiKey.value = 'not-a-valid-key'
    const w = mountPanel()
    expect(w.find('.warning').exists()).toBe(true)
    expect(w.find('.warning').text()).toContain('sk-')
  })

  it('does NOT show openai format error when provider is gemini', () => {
    mockState.provider.value = 'gemini'
    mockState.apiKey.value = 'not-a-valid-key'
    const w = mountPanel()
    // No format error from openaiKeyFormatError; encryption warning may appear
    const warnings = w.findAll('.warning').map(w => w.text())
    expect(warnings.some(t => t.includes('sk-'))).toBe(false)
  })

  // ── Gemini conditional section ─────────────────────────────────────────────

  it('renders #gemini-key when provider is gemini', () => {
    mockState.provider.value = 'gemini'
    const w = mountPanel()
    expect(w.find('#gemini-key').exists()).toBe(true)
  })

  it('hides #gemini-key when provider is openai', () => {
    mockState.provider.value = 'openai'
    const w = mountPanel()
    expect(w.find('#gemini-key').exists()).toBe(false)
  })

  it('#gemini-key input defaults to type="password"', () => {
    mockState.provider.value = 'gemini'
    const w = mountPanel()
    expect(w.find('#gemini-key').attributes('type')).toBe('password')
  })

  it('gemini eye button toggles #gemini-key to type="text"', async () => {
    mockState.provider.value = 'gemini'
    const w = mountPanel()
    await w.find('.gemini-key-toggle').trigger('click')
    expect(w.find('#gemini-key').attributes('type')).toBe('text')
  })

  // ── Nova Sonic conditional section ─────────────────────────────────────────

  it('renders AWS credential fields when provider is nova-sonic', () => {
    mockState.provider.value = 'nova-sonic'
    const w = mountPanel()
    expect(w.find('#aws-access-key-id').exists()).toBe(true)
    expect(w.find('#aws-secret-key').exists()).toBe(true)
    expect(w.find('#aws-session-token').exists()).toBe(true)
    expect(w.find('#aws-region').exists()).toBe(true)
  })

  it('hides AWS credential fields when provider is openai', () => {
    mockState.provider.value = 'openai'
    const w = mountPanel()
    expect(w.find('#aws-access-key-id').exists()).toBe(false)
    expect(w.find('#aws-secret-key').exists()).toBe(false)
  })

  it('session token hint is visible when provider is nova-sonic', () => {
    mockState.provider.value = 'nova-sonic'
    const w = mountPanel()
    const hints = w.findAll('.hint')
    expect(hints.some(h => h.text().toLowerCase().includes('blank'))).toBe(true)
  })

  it('#aws-region is type="text" (not secret)', () => {
    mockState.provider.value = 'nova-sonic'
    const w = mountPanel()
    expect(w.find('#aws-region').attributes('type')).toBe('text')
  })

  // ── Analysis model dropdown ────────────────────────────────────────────────

  it('renders the analysis model dropdown when provider is openai', () => {
    mockState.provider.value = 'openai'
    const w = mountPanel()
    expect(w.find('#analysis-model').exists()).toBe(true)
  })

  it('hides the analysis model dropdown when provider is gemini', () => {
    mockState.provider.value = 'gemini'
    const w = mountPanel()
    expect(w.find('#analysis-model').exists()).toBe(false)
  })

  it('hides the analysis model dropdown when provider is nova-sonic', () => {
    mockState.provider.value = 'nova-sonic'
    const w = mountPanel()
    expect(w.find('#analysis-model').exists()).toBe(false)
  })

  it('analysis model dropdown is populated with analysisModels from the composable', () => {
    mockState.provider.value = 'openai'
    const w = mountPanel()
    const options = w.find('#analysis-model').findAll('option')
    expect(options).toHaveLength(MOCK_ANALYSIS_MODELS.length)
    expect(options[0].element.value).toBe('gpt-4.1')
  })

  it('analysis model dropdown reflects the current analysisModel value', () => {
    mockState.provider.value = 'openai'
    mockState.analysisModel.value = 'gpt-4o'
    const w = mountPanel()
    const select = w.find('#analysis-model').element as HTMLSelectElement
    expect(select.value).toBe('gpt-4o')
  })

  it('analysis model dropdown is disabled while models are loading', () => {
    mockState.provider.value = 'openai'
    mockState.modelsLoading.value = true
    const w = mountPanel()
    expect((w.find('#analysis-model').element as HTMLSelectElement).disabled).toBe(true)
  })

  // ── Analysis window input ──────────────────────────────────────────────────

  it('renders the analysis window input when provider is openai', () => {
    mockState.provider.value = 'openai'
    const w = mountPanel()
    expect(w.find('#analysis-window').exists()).toBe(true)
  })

  it('shows the analysis window input when provider is gemini', () => {
    mockState.provider.value = 'gemini'
    const w = mountPanel()
    expect(w.find('#analysis-window').exists()).toBe(true)
  })

  it('analysis window input has min=20 and max=60', () => {
    mockState.provider.value = 'openai'
    const w = mountPanel()
    const input = w.find('#analysis-window')
    expect(input.attributes('min')).toBe('20')
    expect(input.attributes('max')).toBe('60')
  })

  it('analysis window input reflects the current analysisWindowSeconds value', () => {
    mockState.provider.value = 'openai'
    mockState.analysisWindowSeconds.value = 45
    const w = mountPanel()
    expect((w.find('#analysis-window').element as HTMLInputElement).value).toBe('45')
  })

  // ── Gemini analysis model dropdown ─────────────────────────────────────────

  it('renders the gemini analysis model dropdown when provider is gemini', () => {
    mockState.provider.value = 'gemini'
    const w = mountPanel()
    expect(w.find('#gemini-analysis-model').exists()).toBe(true)
  })

  it('hides the gemini analysis model dropdown when provider is openai', () => {
    mockState.provider.value = 'openai'
    const w = mountPanel()
    expect(w.find('#gemini-analysis-model').exists()).toBe(false)
  })

  it('gemini analysis model dropdown is populated from geminiAnalysisModels', () => {
    mockState.provider.value = 'gemini'
    const w = mountPanel()
    const options = w.find('#gemini-analysis-model').findAll('option')
    expect(options).toHaveLength(MOCK_GEMINI_ANALYSIS_MODELS.length)
    expect(options[0].element.value).toBe('gemini-2.5-flash-preview')
  })

  it('gemini analysis model dropdown reflects the current geminiAnalysisModel value', () => {
    mockState.provider.value = 'gemini'
    mockState.geminiAnalysisModel.value = 'gemini-2.0-flash'
    const w = mountPanel()
    expect((w.find('#gemini-analysis-model').element as HTMLSelectElement).value).toBe('gemini-2.0-flash')
  })

  it('gemini analysis model field has a refresh button', () => {
    mockState.provider.value = 'gemini'
    const w = mountPanel()
    // The refresh button is in the same .field as #gemini-analysis-model
    const field = w.find('#gemini-analysis-model').element.closest('.field')!
    const btn = field.querySelector('button')
    expect(btn).not.toBeNull()
  })

  it('gemini refresh button calls fetchModels on click', async () => {
    mockState.provider.value = 'gemini'
    mockState.geminiApiKey.value = 'AIza-x'
    const w = mountPanel()
    const field = w.find('#gemini-analysis-model').element.closest('.field')!
    const btn = field.querySelector('button') as HTMLButtonElement
    await btn.click()
    expect(mockState.fetchModels).toHaveBeenCalledTimes(1)
  })

  it('gemini refresh button is disabled when geminiApiKey is empty', () => {
    mockState.provider.value = 'gemini'
    mockState.geminiApiKey.value = ''
    const w = mountPanel()
    const field = w.find('#gemini-analysis-model').element.closest('.field')!
    const btn = field.querySelector('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('gemini refresh button is disabled while modelsLoading is true', () => {
    mockState.provider.value = 'gemini'
    mockState.geminiApiKey.value = 'AIza-x'
    mockState.modelsLoading.value = true
    const w = mountPanel()
    const field = w.find('#gemini-analysis-model').element.closest('.field')!
    const btn = field.querySelector('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('gemini analysis model select is disabled while modelsLoading is true', () => {
    mockState.provider.value = 'gemini'
    mockState.modelsLoading.value = true
    const w = mountPanel()
    expect((w.find('#gemini-analysis-model').element as HTMLSelectElement).disabled).toBe(true)
  })

  // ── Analysis window shared visibility ──────────────────────────────────────

  it('shows analysis window for gemini provider', () => {
    mockState.provider.value = 'gemini'
    const w = mountPanel()
    expect(w.find('#analysis-window').exists()).toBe(true)
  })

  it('hides analysis window for nova-sonic provider', () => {
    mockState.provider.value = 'nova-sonic'
    const w = mountPanel()
    expect(w.find('#analysis-window').exists()).toBe(false)
  })
})
