export interface AudioSource {
  id: string
  name: string
  type: 'audioinput' | 'desktop'
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
  getDesktopSources: () => Promise<AudioSource[]>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI | undefined
  }
}
