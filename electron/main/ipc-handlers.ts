import { ipcMain, desktopCapturer, shell } from 'electron'
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

  ipcMain.handle('audio:get-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 0, height: 0 } // skip thumbnails for performance
    })
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      type: s.id.startsWith('screen') ? 'screen' : 'window'
    }))
  })

  ipcMain.handle('shell:open-external', (_event, url: string) => {
    // Only allow http/https URLs
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
  })
}
