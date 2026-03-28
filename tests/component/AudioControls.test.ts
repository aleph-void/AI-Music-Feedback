import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

// ── Mock composable ────────────────────────────────────────────────────────
// State is created fresh in beforeEach so every test gets a clean slate.
// The vi.mock factory reads `audioMock` lazily (component setup runs at
// mount time, which is after beforeEach).

let audioMock: {
  sources: ReturnType<typeof ref<Array<{ id: string; name: string; type: string }>>>
  isCapturing: ReturnType<typeof ref<boolean>>
  captureError: ReturnType<typeof ref<string | null>>
  getSources: ReturnType<typeof vi.fn>
  startCapture: ReturnType<typeof vi.fn>
  stopCapture: ReturnType<typeof vi.fn>
}

let micMock: {
  isCapturing: ReturnType<typeof ref<boolean>>
  captureError: ReturnType<typeof ref<string | null>>
  startCapture: ReturnType<typeof vi.fn>
  stopCapture: ReturnType<typeof vi.fn>
}

function createAudioMock() {
  const isCapturing = ref(false)
  return {
    sources: ref<Array<{ id: string; name: string; type: string }>>([] as never),
    isCapturing,
    captureError: ref<string | null>(null),
    getSources: vi.fn().mockResolvedValue(undefined),
    startCapture: vi.fn().mockResolvedValue(undefined),
    stopCapture: vi.fn(() => { isCapturing.value = false })
  }
}

function createMicMock() {
  const isCapturing = ref(false)
  return {
    isCapturing,
    captureError: ref<string | null>(null),
    startCapture: vi.fn().mockResolvedValue(undefined),
    stopCapture: vi.fn(() => { isCapturing.value = false })
  }
}

vi.mock('@/composables/useAudioCapture', () => ({
  useAudioCapture: () => audioMock
}))
vi.mock('@/composables/useMicCapture', () => ({
  useMicCapture: () => micMock
}))

import AudioControls from '@/components/AudioControls.vue'

const SCREEN_SOURCE = { id: 'default', name: 'Default', type: 'audioinput' }
const WINDOW_SOURCE = { id: 'mic1', name: 'Built-in Microphone', type: 'audioinput' }

beforeEach(() => {
  vi.clearAllMocks()
  audioMock = createAudioMock()
  micMock = createMicMock()
})

describe('AudioControls', () => {
  function mountControls(props: Record<string, unknown> = {}) {
    return mount(AudioControls, { attachTo: document.body, props: { connected: true, ...props } })
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders a source select dropdown', () => {
    const w = mountControls()
    expect(w.find('select').exists()).toBe(true)
  })

  it('renders the refresh button', () => {
    const w = mountControls()
    expect(w.find('.refresh-btn').exists()).toBe(true)
  })

  it('renders the Start Streaming button when not capturing', () => {
    const w = mountControls()
    expect(w.find('.start-btn').exists()).toBe(true)
    expect(w.find('.stop-btn').exists()).toBe(false)
  })

  it('renders the Stop Streaming button when capturing', () => {
    audioMock.isCapturing.value = true
    const w = mountControls()
    expect(w.find('.stop-btn').exists()).toBe(true)
    expect(w.find('.start-btn').exists()).toBe(false)
  })

  it('populates the select with available sources', () => {
    audioMock.sources.value = [SCREEN_SOURCE, WINDOW_SOURCE]
    const w = mountControls()
    const primarySelect = w.findAll('select')[0]
    const options = primarySelect.findAll('option').filter(o => o.attributes('disabled') === undefined)
    expect(options).toHaveLength(2)
  })

  it('shows audio sources with the 🎤 icon', () => {
    audioMock.sources.value = [SCREEN_SOURCE]
    const w = mountControls()
    const option = w.findAll('option').find(o => o.text().includes('Default'))
    expect(option!.text()).toContain('🎤')
  })

  it('shows the error message when captureError is set', () => {
    audioMock.captureError.value = 'Permission denied by user'
    const w = mountControls()
    expect(w.find('.error-msg').exists()).toBe(true)
    expect(w.find('.error-msg').text()).toContain('Permission denied')
  })

  it('hides the error message when captureError is null', () => {
    const w = mountControls()
    expect(w.find('.error-msg').exists()).toBe(false)
  })

  it('hides the level bar when not capturing', () => {
    const w = mountControls()
    expect(w.find('.level-row').exists()).toBe(false)
  })

  it('shows the level bar when capturing', () => {
    audioMock.isCapturing.value = true
    const w = mountControls()
    expect(w.find('.level-row').exists()).toBe(true)
  })

  // ── Source selection ───────────────────────────────────────────────────────

  it('Start Streaming is disabled when no source is selected', () => {
    const w = mountControls()
    expect((w.find('.start-btn').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('Start Streaming is disabled when not connected to OpenAI (even with source selected)', async () => {
    audioMock.sources.value = [SCREEN_SOURCE]
    const w = mountControls({ connected: false })
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    await w.vm.$nextTick()
    expect((w.find('.start-btn').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('Start Streaming is enabled when connected and a source is selected', async () => {
    audioMock.sources.value = [SCREEN_SOURCE]
    const w = mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    await w.vm.$nextTick()
    expect((w.find('.start-btn').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('Start Streaming is disabled when connected but no source is selected', () => {
    const w = mountControls()
    expect((w.find('.start-btn').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('Start Streaming is enabled when a source is pre-selected (via onMounted)', async () => {
    // onMounted calls getSources and sets selectedSourceId to first source
    audioMock.sources.value = [SCREEN_SOURCE]
    const w = mountControls()
    await vi.waitFor(() => {
      expect(audioMock.getSources).toHaveBeenCalled()
    })
    await w.vm.$nextTick()
    expect((w.find('.start-btn').element as HTMLButtonElement).disabled).toBe(false)
  })

  // ── Interactions ───────────────────────────────────────────────────────────

  it('calls getSources on mount', async () => {
    mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalledTimes(1))
  })

  it('calls getSources when the refresh button is clicked', async () => {
    const w = mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    await w.find('.refresh-btn').trigger('click')
    expect(audioMock.getSources).toHaveBeenCalledTimes(2)
  })

  it('refresh button is disabled while capturing', () => {
    audioMock.isCapturing.value = true
    const w = mountControls()
    expect((w.find('.refresh-btn').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls startCapture when Start Streaming is clicked', async () => {
    audioMock.sources.value = [SCREEN_SOURCE]
    const w = mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    await w.vm.$nextTick()
    await w.find('.start-btn').trigger('click')
    expect(audioMock.startCapture).toHaveBeenCalledTimes(1)
  })

  it('calls stopCapture when Stop Streaming is clicked', async () => {
    audioMock.isCapturing.value = true
    const w = mountControls()
    await w.find('.stop-btn').trigger('click')
    expect(audioMock.stopCapture).toHaveBeenCalledTimes(1)
  })

  it('emits "stopped" when Stop Streaming is clicked', async () => {
    audioMock.isCapturing.value = true
    const w = mountControls()
    await w.find('.stop-btn').trigger('click')
    expect(w.emitted('stopped')).toHaveLength(1)
  })

  it('emits "chunk" with the ArrayBuffer from the onChunk callback', async () => {
    audioMock.sources.value = [SCREEN_SOURCE]
    audioMock.startCapture.mockImplementation(async (_sourceId: string, onChunk: (b: ArrayBuffer) => void) => {
      onChunk(new ArrayBuffer(8))
    })
    const w = mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    await w.vm.$nextTick()
    await w.find('.start-btn').trigger('click')
    expect(w.emitted('chunk')).toHaveLength(1)
    expect(w.emitted('chunk')![0][0]).toBeInstanceOf(ArrayBuffer)
  })

  it('emits "levelUpdate" with the level from the onLevel callback', async () => {
    audioMock.sources.value = [SCREEN_SOURCE]
    audioMock.startCapture.mockImplementation(
      async (_sourceId: string, _onChunk: unknown, onLevel: (l: number) => void) => {
        onLevel(0.75)
      }
    )
    const w = mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    await w.vm.$nextTick()
    await w.find('.start-btn').trigger('click')
    expect(w.emitted('levelUpdate')).toHaveLength(1)
    expect(w.emitted('levelUpdate')![0][0]).toBe(0.75)
  })

  it('level bar fill width starts at 0%', () => {
    audioMock.isCapturing.value = true
    const w = mountControls()
    expect(w.find('.level-fill').attributes('style')).toContain('width: 0%')
  })

  it('passes audioTimeout * 1000 to startCapture', async () => {
    audioMock.sources.value = [SCREEN_SOURCE]
    const w = mountControls({ audioTimeout: 7 })
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    await w.vm.$nextTick()
    await w.find('.start-btn').trigger('click')
    const [, , , timeoutArg] = audioMock.startCapture.mock.calls[0] as [unknown, unknown, unknown, number]
    expect(timeoutArg).toBe(7000)
  })

  it('passes 0 to startCapture when audioTimeout is 0 (no silence timeout)', async () => {
    audioMock.sources.value = [SCREEN_SOURCE]
    const w = mountControls({ audioTimeout: 0 })
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    await w.vm.$nextTick()
    await w.find('.start-btn').trigger('click')
    const [, , , timeoutArg] = audioMock.startCapture.mock.calls[0] as [unknown, unknown, unknown, number]
    expect(timeoutArg).toBe(0)
  })

  // ── Spacebar shortcut ──────────────────────────────────────────────────────

  it('starts capture when Space is pressed and a source is selected', async () => {
    audioMock.sources.value = [SCREEN_SOURCE]
    const w = mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    await w.vm.$nextTick()
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    expect(audioMock.startCapture).toHaveBeenCalledTimes(1)
  })

  it('stops capture when Space is pressed while capturing', async () => {
    audioMock.isCapturing.value = true
    const w = mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    expect(audioMock.stopCapture).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('does not start capture when Space is pressed with no source selected', async () => {
    const w = mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    expect(audioMock.startCapture).not.toHaveBeenCalled()
    w.unmount()
  })

  it('ignores Space when an input element is focused', async () => {
    audioMock.sources.value = [SCREEN_SOURCE]
    const w = mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    expect(audioMock.startCapture).not.toHaveBeenCalled()
    input.remove()
    w.unmount()
  })

  // ── Microphone input ───────────────────────────────────────────────────────

  it('renders the microphone select dropdown', () => {
    const w = mountControls()
    const selects = w.findAll('select')
    expect(selects).toHaveLength(2)
  })

  it('mic dropdown has a default "none" option', () => {
    const w = mountControls()
    const micSelect = w.findAll('select')[1]
    expect(micSelect.find('option').text()).toContain('None')
  })

  it('mic dropdown shows sources with 🎙 icon', () => {
    audioMock.sources.value = [SCREEN_SOURCE]
    const w = mountControls()
    const micSelect = w.findAll('select')[1]
    const options = micSelect.findAll('option').filter(o => o.attributes('value') !== '')
    expect(options[0].text()).toContain('🎙')
  })

  it('does not start mic capture when no mic is selected', async () => {
    audioMock.sources.value = [SCREEN_SOURCE]
    const w = mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    await w.vm.$nextTick()
    await w.find('.start-btn').trigger('click')
    expect(micMock.startCapture).not.toHaveBeenCalled()
  })

  it('starts mic capture when a mic source is selected and streaming starts', async () => {
    audioMock.sources.value = [SCREEN_SOURCE, WINDOW_SOURCE]
    const w = mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    await w.vm.$nextTick()
    // Select mic
    await w.findAll('select')[1].setValue(WINDOW_SOURCE.id)
    await w.find('.start-btn').trigger('click')
    expect(micMock.startCapture).toHaveBeenCalledWith(
      WINDOW_SOURCE.id,
      expect.any(Function),
      expect.any(Function)
    )
  })

  it('stops mic capture when Stop Streaming is clicked', async () => {
    audioMock.isCapturing.value = true
    micMock.isCapturing.value = true
    const w = mountControls()
    await w.find('.stop-btn').trigger('click')
    // stopCapture mock sets isCapturing.value = false, which triggers the watcher
    await vi.waitFor(() => expect(micMock.stopCapture).toHaveBeenCalled())
  })

  it('stops mic capture when primary capture stops via silence timeout', async () => {
    audioMock.isCapturing.value = true
    micMock.isCapturing.value = true
    mountControls()
    // Simulate primary capture stopping (e.g. silence timeout)
    audioMock.stopCapture()
    await vi.waitFor(() => expect(micMock.stopCapture).toHaveBeenCalled())
  })

  it('emits "chunk" from mic audio', async () => {
    audioMock.sources.value = [SCREEN_SOURCE, WINDOW_SOURCE]
    micMock.startCapture.mockImplementation(async (_id: string, onChunk: (b: ArrayBuffer) => void) => {
      onChunk(new ArrayBuffer(4))
    })
    const w = mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    await w.vm.$nextTick()
    // Primary auto-selects SCREEN_SOURCE; pick a different device for mic
    await w.findAll('select')[1].setValue(WINDOW_SOURCE.id)
    await w.find('.start-btn').trigger('click')
    const chunks = w.emitted('chunk') ?? []
    expect(chunks.length).toBeGreaterThanOrEqual(1)
  })

  it('shows mic level bar when mic is capturing', () => {
    micMock.isCapturing.value = true
    const w = mountControls()
    const levelRows = w.findAll('.level-row')
    expect(levelRows).toHaveLength(1)
    expect(w.findAll('.level-fill')[0].classes()).toContain('mic-fill')
  })

  it('shows both level bars when both sources are capturing', () => {
    audioMock.isCapturing.value = true
    micMock.isCapturing.value = true
    const w = mountControls()
    expect(w.findAll('.level-row')).toHaveLength(2)
  })

  // ── Device conflict validation ─────────────────────────────────────────────

  it('shows conflict error when mic and source are the same device', async () => {
    audioMock.sources.value = [SCREEN_SOURCE, WINDOW_SOURCE]
    const w = mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    await w.vm.$nextTick()
    await w.findAll('select')[0].setValue(SCREEN_SOURCE.id)
    await w.findAll('select')[1].setValue(SCREEN_SOURCE.id)
    expect(w.find('.error-msg').exists()).toBe(true)
    expect(w.find('.error-msg').text()).toContain('different devices')
  })

  it('hides conflict error when mic and source are different devices', async () => {
    audioMock.sources.value = [SCREEN_SOURCE, WINDOW_SOURCE]
    const w = mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    await w.vm.$nextTick()
    await w.findAll('select')[0].setValue(SCREEN_SOURCE.id)
    await w.findAll('select')[1].setValue(WINDOW_SOURCE.id)
    expect(w.find('.error-msg').exists()).toBe(false)
  })

  it('hides conflict error when no mic is selected', async () => {
    audioMock.sources.value = [SCREEN_SOURCE]
    const w = mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    await w.vm.$nextTick()
    await w.findAll('select')[0].setValue(SCREEN_SOURCE.id)
    // mic stays at default empty value
    expect(w.find('.error-msg').exists()).toBe(false)
  })

  it('disables Start Streaming when mic and source are the same device', async () => {
    audioMock.sources.value = [SCREEN_SOURCE, WINDOW_SOURCE]
    const w = mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    await w.vm.$nextTick()
    await w.findAll('select')[0].setValue(SCREEN_SOURCE.id)
    await w.findAll('select')[1].setValue(SCREEN_SOURCE.id)
    expect((w.find('.start-btn').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not call startCapture when mic conflicts with source', async () => {
    audioMock.sources.value = [SCREEN_SOURCE, WINDOW_SOURCE]
    const w = mountControls()
    await vi.waitFor(() => expect(audioMock.getSources).toHaveBeenCalled())
    await w.vm.$nextTick()
    await w.findAll('select')[0].setValue(SCREEN_SOURCE.id)
    await w.findAll('select')[1].setValue(SCREEN_SOURCE.id)
    await w.find('.start-btn').trigger('click')
    expect(audioMock.startCapture).not.toHaveBeenCalled()
  })
})
