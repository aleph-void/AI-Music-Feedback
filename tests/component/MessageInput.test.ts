import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageInput from '@/components/MessageInput.vue'

describe('MessageInput', () => {
  function mountInput(connected = true) {
    return mount(MessageInput, { props: { connected }, attachTo: document.body })
  }

  it('renders the textarea', () => {
    const w = mountInput()
    expect(w.find('textarea').exists()).toBe(true)
  })

  it('renders the send button', () => {
    const w = mountInput()
    expect(w.find('.send-btn').exists()).toBe(true)
  })

  it('textarea is disabled when not connected', () => {
    const w = mountInput(false)
    expect((w.find('textarea').element as HTMLTextAreaElement).disabled).toBe(true)
  })

  it('send button is disabled when not connected', () => {
    const w = mountInput(false)
    expect((w.find('.send-btn').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('send button is disabled when textarea is empty', () => {
    const w = mountInput(true)
    expect((w.find('.send-btn').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('send button is enabled when connected and text is entered', async () => {
    const w = mountInput(true)
    await w.find('textarea').setValue('How does the mix sound?')
    expect((w.find('.send-btn').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('emits "send" with the text when the send button is clicked', async () => {
    const w = mountInput(true)
    await w.find('textarea').setValue('Nice chord progression')
    await w.find('.send-btn').trigger('click')
    expect(w.emitted('send')).toHaveLength(1)
    expect(w.emitted('send')![0][0]).toBe('Nice chord progression')
  })

  it('clears the textarea after sending', async () => {
    const w = mountInput(true)
    await w.find('textarea').setValue('Test message')
    await w.find('.send-btn').trigger('click')
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('')
  })

  it('emits "send" when Enter is pressed (without Shift)', async () => {
    const w = mountInput(true)
    await w.find('textarea').setValue('Enter key test')
    await w.find('textarea').trigger('keydown.enter')
    expect(w.emitted('send')).toHaveLength(1)
    expect(w.emitted('send')![0][0]).toBe('Enter key test')
  })

  it('does not emit "send" when text is only whitespace', async () => {
    const w = mountInput(true)
    await w.find('textarea').setValue('   ')
    await w.find('.send-btn').trigger('click')
    expect(w.emitted('send')).toBeUndefined()
  })

  it('does not emit "send" when Shift+Enter is pressed', async () => {
    const w = mountInput(true)
    await w.find('textarea').setValue('multiline')
    await w.find('textarea').trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(w.emitted('send')).toBeUndefined()
  })
})
