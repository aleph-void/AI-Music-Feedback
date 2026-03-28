import { safeStorage, app } from 'electron'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'

const STORE_PATH = join(app.getPath('userData'), 'secure-store.bin')
const FALLBACK_PATH = join(app.getPath('userData'), 'store.json')

export function saveApiKey(plaintext: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(plaintext)
    writeFileSync(STORE_PATH, encrypted)
    // Clean up any fallback file if it exists
    if (existsSync(FALLBACK_PATH)) unlinkSync(FALLBACK_PATH)
  } else {
    // Fallback: store in plain JSON with a warning (Linux without secret store)
    writeFileSync(FALLBACK_PATH, JSON.stringify({ apiKey: plaintext, warning: 'unencrypted' }))
  }
}

export function loadApiKey(): string | null {
  try {
    if (safeStorage.isEncryptionAvailable() && existsSync(STORE_PATH)) {
      const encrypted = readFileSync(STORE_PATH)
      return safeStorage.decryptString(encrypted)
    }
    if (existsSync(FALLBACK_PATH)) {
      const data = JSON.parse(readFileSync(FALLBACK_PATH, 'utf-8'))
      return data.apiKey ?? null
    }
  } catch {
    // Corrupted store — return null
  }
  return null
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}
