import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock is hoisted — factories run before any import statements
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(s + ':enc')),
    decryptString: vi.fn((b: Buffer) => b.toString().replace(':enc', ''))
  },
  app: {
    getPath: vi.fn(() => '/tmp/test-userdata')
  }
}))

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  unlinkSync: vi.fn()
}))

// Imports come after mocks
import * as fs from 'fs'
import { safeStorage } from 'electron'
import { saveApiKey, loadApiKey, isEncryptionAvailable } from '../../../electron/main/store'

const fsMock = vi.mocked(fs)
const safeMock = vi.mocked(safeStorage)

describe('store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fsMock.existsSync.mockReturnValue(false)
    safeMock.isEncryptionAvailable.mockReturnValue(true)
    safeMock.encryptString.mockImplementation((s: string) => Buffer.from(s + ':enc'))
    safeMock.decryptString.mockImplementation((b: Buffer) => b.toString().replace(':enc', ''))
  })

  // ── saveApiKey ─────────────────────────────────────────────────────────────

  describe('saveApiKey', () => {
    it('calls encryptString with the plaintext key', () => {
      saveApiKey('sk-mykey')
      expect(safeMock.encryptString).toHaveBeenCalledWith('sk-mykey')
    })

    it('writes encrypted bytes to the secure-store.bin path', () => {
      saveApiKey('sk-mykey')
      const [path, data] = fsMock.writeFileSync.mock.calls[0]
      expect(String(path)).toContain('secure-store.bin')
      expect(Buffer.isBuffer(data)).toBe(true)
    })

    it('removes the fallback store.json when it exists', () => {
      fsMock.existsSync.mockReturnValue(true) // fallback file present
      saveApiKey('sk-mykey')
      expect(fsMock.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('store.json')
      )
    })

    it('does not call unlinkSync when fallback file is absent', () => {
      fsMock.existsSync.mockReturnValue(false)
      saveApiKey('sk-mykey')
      expect(fsMock.unlinkSync).not.toHaveBeenCalled()
    })

    it('falls back to plain JSON when encryption is unavailable', () => {
      safeMock.isEncryptionAvailable.mockReturnValue(false)
      saveApiKey('sk-plaintext')
      expect(safeMock.encryptString).not.toHaveBeenCalled()
      const [path, content] = fsMock.writeFileSync.mock.calls[0]
      expect(String(path)).toContain('store.json')
      const parsed = JSON.parse(String(content))
      expect(parsed.apiKey).toBe('sk-plaintext')
      expect(parsed.warning).toBe('unencrypted')
    })

    it('plain JSON fallback never touches the binary store path', () => {
      safeMock.isEncryptionAvailable.mockReturnValue(false)
      saveApiKey('sk-plaintext')
      const [path] = fsMock.writeFileSync.mock.calls[0]
      expect(String(path)).not.toContain('secure-store.bin')
    })
  })

  // ── loadApiKey ─────────────────────────────────────────────────────────────

  describe('loadApiKey', () => {
    it('returns null when neither store file exists', () => {
      fsMock.existsSync.mockReturnValue(false)
      expect(loadApiKey()).toBeNull()
    })

    it('decrypts and returns the key from the binary store', () => {
      fsMock.existsSync.mockReturnValue(true)
      const encrypted = Buffer.from('sk-secret:enc')
      fsMock.readFileSync.mockReturnValue(encrypted)
      safeMock.decryptString.mockReturnValue('sk-secret')

      expect(loadApiKey()).toBe('sk-secret')
      expect(safeMock.decryptString).toHaveBeenCalledWith(encrypted)
    })

    it('reads from fallback JSON when encryption is unavailable', () => {
      safeMock.isEncryptionAvailable.mockReturnValue(false)
      fsMock.existsSync.mockReturnValue(true)
      fsMock.readFileSync.mockReturnValue('{"apiKey":"sk-fallback","warning":"unencrypted"}')

      expect(loadApiKey()).toBe('sk-fallback')
    })

    it('returns null when fallback JSON has no apiKey field', () => {
      safeMock.isEncryptionAvailable.mockReturnValue(false)
      fsMock.existsSync.mockReturnValue(true)
      fsMock.readFileSync.mockReturnValue('{"warning":"unencrypted"}')

      expect(loadApiKey()).toBeNull()
    })

    it('returns null and does not throw when the binary store is corrupted', () => {
      fsMock.existsSync.mockReturnValue(true)
      safeMock.decryptString.mockImplementation(() => { throw new Error('corrupt') })
      fsMock.readFileSync.mockReturnValue(Buffer.from('garbage'))

      expect(() => loadApiKey()).not.toThrow()
      expect(loadApiKey()).toBeNull()
    })

    it('returns null and does not throw when fallback JSON is malformed', () => {
      safeMock.isEncryptionAvailable.mockReturnValue(false)
      fsMock.existsSync.mockReturnValue(true)
      fsMock.readFileSync.mockReturnValue('not-valid-json{{{')

      expect(() => loadApiKey()).not.toThrow()
      expect(loadApiKey()).toBeNull()
    })

    it('prefers encrypted store over fallback when both exist', () => {
      safeMock.isEncryptionAvailable.mockReturnValue(true)
      fsMock.existsSync.mockReturnValue(true)
      const encrypted = Buffer.from('sk-encrypted:enc')
      fsMock.readFileSync.mockReturnValue(encrypted)
      safeMock.decryptString.mockReturnValue('sk-encrypted')

      const result = loadApiKey()
      expect(result).toBe('sk-encrypted')
      // decryptString should be called (not JSON.parse path)
      expect(safeMock.decryptString).toHaveBeenCalled()
    })
  })

  // ── isEncryptionAvailable ──────────────────────────────────────────────────

  describe('isEncryptionAvailable', () => {
    it('returns true when safeStorage reports available', () => {
      safeMock.isEncryptionAvailable.mockReturnValue(true)
      expect(isEncryptionAvailable()).toBe(true)
    })

    it('returns false when safeStorage reports unavailable', () => {
      safeMock.isEncryptionAvailable.mockReturnValue(false)
      expect(isEncryptionAvailable()).toBe(false)
    })
  })
})
