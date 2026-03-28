import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TranscriptView from '@/components/TranscriptView.vue'
import type { TranscriptMessage } from '@/types/realtime'

function makeMsg(overrides: Partial<TranscriptMessage> = {}): TranscriptMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    role: 'assistant',
    content: 'Test content',
    complete: true,
    timestamp: Date.UTC(2024, 0, 15, 10, 30, 0),
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TranscriptView', () => {
  function mount0(transcript: TranscriptMessage[] = []) {
    return mount(TranscriptView, {
      props: { transcript },
      attachTo: document.body
    })
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  it('shows the empty-state element when transcript is empty', () => {
    const w = mount0()
    expect(w.find('.empty-state').exists()).toBe(true)
  })

  it('empty state contains instructional text', () => {
    const w = mount0()
    expect(w.find('.empty-state').text()).toContain('streaming')
  })

  it('hides empty-state when there are messages', () => {
    const w = mount0([makeMsg()])
    expect(w.find('.empty-state').exists()).toBe(false)
  })

  // ── Message rendering ──────────────────────────────────────────────────────

  it('renders one .message element per transcript entry', () => {
    const w = mount0([makeMsg(), makeMsg()])
    expect(w.findAll('.message')).toHaveLength(2)
  })

  it('adds the "assistant" class to assistant messages', () => {
    const w = mount0([makeMsg({ role: 'assistant' })])
    expect(w.find('.message').classes()).toContain('assistant')
  })

  it('adds the "user" class to user messages', () => {
    const w = mount0([makeMsg({ role: 'user' })])
    expect(w.find('.message').classes()).toContain('user')
  })

  it('shows "AI Feedback" as the role label for assistant messages', () => {
    const w = mount0([makeMsg({ role: 'assistant' })])
    expect(w.find('.message-role').text()).toBe('AI Feedback')
  })

  it('shows "Your Audio" as the role label for user messages', () => {
    const w = mount0([makeMsg({ role: 'user' })])
    expect(w.find('.message-role').text()).toBe('Your Audio')
  })

  it('renders the message content text', () => {
    const w = mount0([makeMsg({ content: 'Nice bassline!' })])
    expect(w.find('.message-content').text()).toContain('Nice bassline!')
  })

  it('renders a timestamp for each message', () => {
    const w = mount0([makeMsg()])
    expect(w.find('.message-time').exists()).toBe(true)
    expect(w.find('.message-time').text().length).toBeGreaterThan(0)
  })

  // ── Cursor (incomplete messages) ───────────────────────────────────────────

  it('shows the blinking cursor on incomplete messages', () => {
    const w = mount0([makeMsg({ complete: false })])
    expect(w.find('.cursor').exists()).toBe(true)
  })

  it('hides the cursor on complete messages', () => {
    const w = mount0([makeMsg({ complete: true })])
    expect(w.find('.cursor').exists()).toBe(false)
  })

  it('adds the "pending" class to incomplete messages', () => {
    const w = mount0([makeMsg({ complete: false })])
    expect(w.find('.message').classes()).toContain('pending')
  })

  // ── Header action buttons ──────────────────────────────────────────────────

  it('hides Copy and Clear buttons when transcript is empty', () => {
    const w = mount0()
    expect(w.findAll('.action-btn')).toHaveLength(0)
  })

  it('shows Copy and Clear buttons when transcript has messages', () => {
    const w = mount0([makeMsg()])
    expect(w.findAll('.action-btn')).toHaveLength(2)
  })

  it('emits "clear" when the Clear button is clicked', async () => {
    const w = mount0([makeMsg()])
    await w.find('.action-btn.danger').trigger('click')
    expect(w.emitted('clear')).toHaveLength(1)
  })

  it('calls clipboard.writeText when Copy is clicked', async () => {
    const msg = makeMsg({ role: 'assistant', content: 'Great chord!' })
    const w = mount0([msg])
    await w.find('.action-btn:not(.danger)').trigger('click')
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1)
  })

  it('formats clipboard text as [AI] or [You] prefixed lines', async () => {
    const msgs = [
      makeMsg({ role: 'user', content: 'I played a chord' }),
      makeMsg({ role: 'assistant', content: 'Nice progression!' })
    ]
    const w = mount0(msgs)
    await w.find('.action-btn:not(.danger)').trigger('click')
    const written = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(written).toContain('[You] I played a chord')
    expect(written).toContain('[AI] Nice progression!')
  })

  it('shows "Copied!" after clicking the Copy button', async () => {
    const w = mount0([makeMsg()])
    await w.find('.action-btn:not(.danger)').trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.action-btn:not(.danger)').text()).toBe('Copied!')
  })

  it('resets "Copied!" and shows "Copied!" again if Copy is clicked a second time', async () => {
    vi.useFakeTimers()
    const w = mount0([makeMsg()])
    const copyBtn = () => w.find('.action-btn:not(.danger)')
    await copyBtn().trigger('click')
    await w.vm.$nextTick()
    expect(copyBtn().text()).toBe('Copied!')
    // Click again before the 2s timer fires
    await copyBtn().trigger('click')
    await w.vm.$nextTick()
    expect(copyBtn().text()).toBe('Copied!')
    vi.useRealTimers()
  })

  it('shows "Copy failed" when clipboard.writeText rejects', async () => {
    ;(navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Permission denied'))
    const w = mount0([makeMsg()])
    await w.find('.action-btn:not(.danger)').trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.action-btn:not(.danger)').text()).toBe('Copy failed')
  })

  it('adds the "error" class to the Copy button when clipboard fails', async () => {
    ;(navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('denied'))
    const w = mount0([makeMsg()])
    await w.find('.action-btn:not(.danger)').trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.action-btn:not(.danger)').classes()).toContain('error')
  })

  it('formats timestamps correctly for valid dates', () => {
    const w = mount0([makeMsg({ timestamp: new Date('2024-01-15T14:30:45').getTime() })])
    const timeEl = w.find('.message-time')
    expect(timeEl.exists()).toBe(true)
    expect(timeEl.text()).not.toBe('')
    expect(timeEl.text()).not.toContain('Invalid')
  })

  // ── XSS safety ────────────────────────────────────────────────────────────

  it('renders message content as text, not HTML (XSS prevention)', () => {
    const xss = '<script>window.__xss = true<\/script>'
    const w = mount0([makeMsg({ content: xss })])
    // Vue's mustache binding auto-escapes — the script tag must not be injected
    expect((window as unknown as Record<string, unknown>).__xss).toBeUndefined()
    // The raw tag text should be visible as literal characters in the element
    expect(w.find('.message-content').text()).toContain('<script>')
  })

  it('does not inject HTML from message content', () => {
    const html = '<img src=x onerror="window.__img_xss=1">'
    const w = mount0([makeMsg({ content: html })])
    expect((window as unknown as Record<string, unknown>).__img_xss).toBeUndefined()
    expect(w.find('.message-content').element.querySelector('img')).toBeNull()
  })

  // ── Conversation title ─────────────────────────────────────────────────────

  it('renders the "Conversation" title in the header', () => {
    const w = mount0()
    expect(w.find('.title').text()).toBe('Conversation')
  })
})
