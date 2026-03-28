import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  saveApiKey: (key: string) =>
    ipcRenderer.invoke('store:save-api-key', key) as Promise<{ success: boolean }>,

  loadApiKey: () =>
    ipcRenderer.invoke('store:load-api-key') as Promise<{ key: string | null; encrypted: boolean }>,

  openExternal: (url: string) =>
    ipcRenderer.invoke('shell:open-external', url) as Promise<void>,

  exportTranscript: (content: string, defaultName: string) =>
    ipcRenderer.invoke('dialog:export-transcript', content, defaultName) as Promise<{
      success: boolean; canceled?: boolean; filePath?: string; error?: string
    }>,

  onMenuExportTranscript: (callback: () => void) => {
    ipcRenderer.on('menu:export-transcript', callback)
    return () => ipcRenderer.removeListener('menu:export-transcript', callback)
  }
})
