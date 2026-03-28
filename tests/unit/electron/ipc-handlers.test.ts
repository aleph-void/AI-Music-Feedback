import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture handlers as they are registered
const registeredHandlers: Record<string, (...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      registeredHandlers[channel] = handler
    })
  },
  desktopCapturer: {
    getSources: vi.fn()
  },
  shell: {
    openExternal: vi.fn()
  }
}))

vi.mock('../../../electron/main/store', () => ({
  saveApiKey: vi.fn(),
  loadApiKey: vi.fn(() => 'sk-loaded'),
  isEncryptionAvailable: vi.fn(() => true)
}))

import { ipcMain, desktopCapturer, shell } from 'electron'
import * as store from '../../../electron/main/store'
import { registerIpcHandlers } from '../../../electron/main/ipc-handlers'

const ipcMock = vi.mocked(ipcMain)
const dcMock = vi.mocked(desktopCapturer)
const shellMock = vi.mocked(shell)
const storeMock = vi.mocked(store)

// Helper: call a registered IPC handler
async function call(channel: string, ...args: unknown[]) {
  return registeredHandlers[channel]?.(null, ...args)
}

describe('IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear captured handlers
    for (const key of Object.keys(registeredHandlers)) delete registeredHandlers[key]
    // Re-attach mock implementation (clearAllMocks wipes it)
    ipcMock.handle.mockImplementation(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        registeredHandlers[channel] = handler
      }
    )
    storeMock.loadApiKey.mockReturnValue('sk-loaded')
    storeMock.isEncryptionAvailable.mockReturnValue(true)

    registerIpcHandlers()
  })

  it('registers exactly 4 IPC channels', () => {
    expect(Object.keys(registeredHandlers)).toHaveLength(4)
  })

  // ── store:save-api-key ─────────────────────────────────────────────────────

  describe('store:save-api-key', () => {
    it('delegates to store.saveApiKey with the provided key', async () => {
      await call('store:save-api-key', 'sk-newkey')
      expect(storeMock.saveApiKey).toHaveBeenCalledWith('sk-newkey')
    })

    it('returns { success: true }', async () => {
      const result = await call('store:save-api-key', 'sk-test')
      expect(result).toEqual({ success: true })
    })
  })

  // ── store:load-api-key ─────────────────────────────────────────────────────

  describe('store:load-api-key', () => {
    it('returns the loaded key and encryption status', async () => {
      const result = await call('store:load-api-key')
      expect(result).toEqual({ key: 'sk-loaded', encrypted: true })
    })

    it('returns null key when nothing is stored', async () => {
      storeMock.loadApiKey.mockReturnValue(null)
      const result = await call('store:load-api-key') as { key: string | null }
      expect(result.key).toBeNull()
    })

    it('reflects encryption unavailability', async () => {
      storeMock.isEncryptionAvailable.mockReturnValue(false)
      const result = await call('store:load-api-key') as { encrypted: boolean }
      expect(result.encrypted).toBe(false)
    })
  })

  // ── audio:get-sources ──────────────────────────────────────────────────────

  describe('audio:get-sources', () => {
    it('calls desktopCapturer.getSources with screen and window types', async () => {
      dcMock.getSources.mockResolvedValue([])
      await call('audio:get-sources')
      expect(dcMock.getSources).toHaveBeenCalledWith(
        expect.objectContaining({ types: expect.arrayContaining(['screen', 'window']) })
      )
    })

    it('requests zero-size thumbnails to avoid overhead', async () => {
      dcMock.getSources.mockResolvedValue([])
      await call('audio:get-sources')
      expect(dcMock.getSources).toHaveBeenCalledWith(
        expect.objectContaining({ thumbnailSize: { width: 0, height: 0 } })
      )
    })

    it('maps sources with screen: prefix to type "screen"', async () => {
      dcMock.getSources.mockResolvedValue([
        { id: 'screen:0:0', name: 'Entire Screen', thumbnail: null } as never
      ])
      const result = await call('audio:get-sources') as Array<{ type: string }>
      expect(result[0].type).toBe('screen')
    })

    it('maps sources without screen: prefix to type "window"', async () => {
      dcMock.getSources.mockResolvedValue([
        { id: 'window:1234:0', name: 'Firefox', thumbnail: null } as never
      ])
      const result = await call('audio:get-sources') as Array<{ type: string }>
      expect(result[0].type).toBe('window')
    })

    it('strips thumbnail data from returned objects', async () => {
      dcMock.getSources.mockResolvedValue([
        { id: 'screen:0:0', name: 'Screen', thumbnail: { toDataURL: () => 'data:...' } } as never
      ])
      const result = await call('audio:get-sources') as Array<Record<string, unknown>>
      expect(result[0]).not.toHaveProperty('thumbnail')
    })

    it('returns an empty array when no sources are found', async () => {
      dcMock.getSources.mockResolvedValue([])
      const result = await call('audio:get-sources')
      expect(result).toEqual([])
    })
  })

  // ── shell:open-external ────────────────────────────────────────────────────

  describe('shell:open-external', () => {
    it('opens https:// URLs', async () => {
      await call('shell:open-external', 'https://openai.com/docs')
      expect(shellMock.openExternal).toHaveBeenCalledWith('https://openai.com/docs')
    })

    it('opens http:// URLs', async () => {
      await call('shell:open-external', 'http://localhost:3000')
      expect(shellMock.openExternal).toHaveBeenCalledWith('http://localhost:3000')
    })

    it('blocks file:// URLs', async () => {
      await call('shell:open-external', 'file:///etc/passwd')
      expect(shellMock.openExternal).not.toHaveBeenCalled()
    })

    it('blocks javascript: URLs', async () => {
      await call('shell:open-external', 'javascript:alert(1)')
      expect(shellMock.openExternal).not.toHaveBeenCalled()
    })

    it('blocks ftp:// URLs', async () => {
      await call('shell:open-external', 'ftp://example.com')
      expect(shellMock.openExternal).not.toHaveBeenCalled()
    })
  })
})
