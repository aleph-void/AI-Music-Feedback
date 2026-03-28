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

function createAudioMock() {
  return {
    sources: ref<Array<{ id: string; name: string; type: string }>>([] as never),
    isCapturing: ref(false),
    captureError: ref<string | null>(null),
    getSources: vi.fn().mockResolvedValue(undefined),
    startCapture: vi.fn().mockResolvedValue(undefined),
    stopCapture: vi.fn()
  }
}

vi.mock('@/composables/useAudioCapture', () => ({
  useAudioCapture: () => audioMock
}))

import AudioControls from '@/components/AudioControls.vue'

const SCREEN_SOURCE = { id: 'screen:0:0', name: 'Entire Screen', type: 'screen' }
const WINDOW_SOURCE = { id: 'window:1:0', name: 'Firefox', type: 'window' }

beforeEach(() => {
  vi.clearAllMocks()
  audioMock = createAudioMock()
})

describe('AudioControls', () => {
  function mountControls() {
    return mount(AudioControls, { attachTo: document.body })
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
    const options = w.findAll('option').filter(o => o.attributes('disabled') === undefined)
    expect(options).toHaveLength(2)
  })

  it('shows screen sources with the 🖥 icon', () => {
    audioMock.sources.value = [SCREEN_SOURCE]
    const w = mountControls()
    const option = w.findAll('option').find(o => o.text().includes('Entire Screen'))
    expect(option!.text()).toContain('🖥')
  })

  it('shows window sources with the 🪟 icon', () => {
    audioMock.sources.value = [WINDOW_SOURCE]
    const w = mountControls()
    const option = w.findAll('option').find(o => o.text().includes('Firefox'))
    expect(option!.text()).toContain('🪟')
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
    audioMock.startCapture.mockImplementation(async (onChunk: (b: ArrayBuffer) => void) => {
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
      async (_onChunk: unknown, onLevel: (l: number) => void) => {
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
})
