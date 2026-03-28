export interface AudioSource {
  id: string
  name: string
  type: 'screen' | 'window'
}

export interface ElectronAPI {
  saveApiKey: (key: string) => Promise<{ success: boolean }>
  loadApiKey: () => Promise<{ key: string | null; encrypted: boolean }>
  getAudioSources: () => Promise<AudioSource[]>
  openExternal: (url: string) => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
