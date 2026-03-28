import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture handlers as they are registered
const registeredHandlers: Record<string, (...args: unknown[]) => unknown> = {}

const { mockShowSaveDialog, mockWriteFileSync } = vi.hoisted(() => ({
  mockShowSaveDialog: vi.fn(),
  mockWriteFileSync: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      registeredHandlers[channel] = handler
    })
  },
  shell: {
    openExternal: vi.fn()
  },
  dialog: {
    showSaveDialog: mockShowSaveDialog
  }
}))

vi.mock('fs', () => ({
  writeFileSync: mockWriteFileSync
}))

vi.mock('../../../electron/main/store', () => ({
  saveApiKey: vi.fn(),
  loadApiKey: vi.fn(() => 'sk-loaded'),
  isEncryptionAvailable: vi.fn(() => true)
}))

import { ipcMain, shell } from 'electron'
import * as store from '../../../electron/main/store'
import { registerIpcHandlers } from '../../../electron/main/ipc-handlers'

const ipcMock = vi.mocked(ipcMain)
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

    it('blocks data: URLs', async () => {
      await call('shell:open-external', 'data:text/html,<script>alert(1)</script>')
      expect(shellMock.openExternal).not.toHaveBeenCalled()
    })

    it('blocks vbscript: URLs', async () => {
      await call('shell:open-external', 'vbscript:msgbox(1)')
      expect(shellMock.openExternal).not.toHaveBeenCalled()
    })

    it('blocks empty string', async () => {
      await call('shell:open-external', '')
      expect(shellMock.openExternal).not.toHaveBeenCalled()
    })

    it('allows uppercase HTTPS:// URLs (URL constructor normalizes protocol)', async () => {
      await call('shell:open-external', 'HTTPS://example.com')
      expect(shellMock.openExternal).toHaveBeenCalledWith('HTTPS://example.com')
    })

    it('blocks URLs with CRLF injection attempts', async () => {
      await call('shell:open-external', 'https://example.com\r\nX-Injected: header')
      // URL constructor throws on CRLF — silently ignored
      expect(shellMock.openExternal).not.toHaveBeenCalled()
    })

    it('does not throw when passed a non-string argument', async () => {
      await expect(call('shell:open-external', 42)).resolves.toBeUndefined()
      expect(shellMock.openExternal).not.toHaveBeenCalled()
    })
  })

  // ── dialog:export-transcript ───────────────────────────────────────────────

  describe('dialog:export-transcript', () => {
    beforeEach(() => {
      mockShowSaveDialog.mockResolvedValue({ filePath: '/home/user/transcript-2024-01-01.txt', canceled: false })
      mockWriteFileSync.mockImplementation(() => {})
    })

    it('shows a save dialog with the provided default name', async () => {
      await call('dialog:export-transcript', 'hello', 'transcript-2024-01-01.txt')
      expect(mockShowSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({ defaultPath: 'transcript-2024-01-01.txt' })
      )
    })

    it('writes the content to the chosen file path', async () => {
      await call('dialog:export-transcript', 'transcript content', 'transcript.txt')
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/home/user/transcript-2024-01-01.txt',
        'transcript content',
        'utf-8'
      )
    })

    it('returns { success: true, filePath } on success', async () => {
      const result = await call('dialog:export-transcript', 'content', 'file.txt')
      expect(result).toEqual({ success: true, filePath: '/home/user/transcript-2024-01-01.txt' })
    })

    it('returns { success: false, canceled: true } when dialog is canceled', async () => {
      mockShowSaveDialog.mockResolvedValue({ filePath: undefined, canceled: true })
      const result = await call('dialog:export-transcript', 'content', 'file.txt')
      expect(result).toEqual({ success: false, canceled: true })
      expect(mockWriteFileSync).not.toHaveBeenCalled()
    })

    it('returns { success: false, error } when writeFileSync throws', async () => {
      mockWriteFileSync.mockImplementation(() => { throw new Error('disk full') })
      const result = await call('dialog:export-transcript', 'content', 'file.txt') as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('disk full')
    })

    it('dialog filters include txt and md options', async () => {
      await call('dialog:export-transcript', 'content', 'file.txt')
      const opts = mockShowSaveDialog.mock.calls[0][0] as { filters: { extensions: string[] }[] }
      const allExtensions = opts.filters.flatMap(f => f.extensions)
      expect(allExtensions).toContain('txt')
      expect(allExtensions).toContain('md')
    })
  })
})
