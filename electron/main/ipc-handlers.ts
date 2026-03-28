import { ipcMain, shell, dialog } from 'electron'
import { writeFileSync } from 'fs'
import { saveApiKey, loadApiKey, isEncryptionAvailable } from './store'

export function registerIpcHandlers(): void {
  ipcMain.handle('store:save-api-key', (_event, key: string) => {
    saveApiKey(key)
    return { success: true }
  })

  ipcMain.handle('store:load-api-key', () => {
    return {
      key: loadApiKey(),
      encrypted: isEncryptionAvailable()
    }
  })

  ipcMain.handle('shell:open-external', (_event, url: unknown) => {
    if (typeof url !== 'string') return
    try {
      const { protocol } = new URL(url)
      if (protocol === 'https:' || protocol === 'http:') {
        shell.openExternal(url)
      }
    } catch {
      // Invalid URL — silently ignore
    }
  })

  ipcMain.handle('dialog:export-transcript', async (_event, content: string, defaultName: string) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export Transcript',
      defaultPath: defaultName,
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'Markdown Files', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (canceled || !filePath) return { success: false, canceled: true }

    try {
      writeFileSync(filePath, content, 'utf-8')
      return { success: true, filePath }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
