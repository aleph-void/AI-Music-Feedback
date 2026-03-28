export interface AudioSource {
  id: string
  name: string
  type: 'audioinput'
}

export interface ElectronAPI {
  platform: string
  saveApiKey: (key: string) => Promise<{ success: boolean }>
  loadApiKey: () => Promise<{ key: string | null; encrypted: boolean }>
  openExternal: (url: string) => Promise<void>
  exportTranscript: (content: string, defaultName: string) => Promise<{
    success: boolean; canceled?: boolean; filePath?: string; error?: string
  }>
  onMenuExportTranscript: (callback: () => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI | undefined
  }
}
