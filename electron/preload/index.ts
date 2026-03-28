import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  saveApiKey: (key: string) =>
    ipcRenderer.invoke('store:save-api-key', key) as Promise<{ success: boolean }>,

  loadApiKey: () =>
    ipcRenderer.invoke('store:load-api-key') as Promise<{ key: string | null; encrypted: boolean }>,

  getAudioSources: () =>
    ipcRenderer.invoke('audio:get-sources') as Promise<Array<{ id: string; name: string; type: string }>>,

  openExternal: (url: string) =>
    ipcRenderer.invoke('shell:open-external', url) as Promise<void>
})
