import { Menu, app, shell } from 'electron'
import type { MenuItemConstructorOptions, BrowserWindow } from 'electron'

export function setupMenu(getWindow: () => BrowserWindow | null): void {
  const isMac = process.platform === 'darwin'
  const isDev = !app.isPackaged

  const template: MenuItemConstructorOptions[] = [
    // macOS application menu (app name)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),

    {
      label: 'File',
      submenu: [
        {
          label: 'Export Transcript…',
          accelerator: isMac ? 'Cmd+E' : 'Ctrl+E',
          click: (_item, win) => {
            const target = win ?? getWindow()
            target?.webContents.send('menu:export-transcript')
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },

    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const }
      ]
    },

    {
      label: 'View',
      submenu: [
        ...(isDev ? [
          { role: 'reload' as const },
          { role: 'forceReload' as const },
          { role: 'toggleDevTools' as const },
          { type: 'separator' as const }
        ] : []),
        { role: 'togglefullscreen' as const }
      ]
    },

    ...(isMac ? [{
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        { type: 'separator' as const },
        { role: 'front' as const }
      ]
    }] : []),

    {
      label: 'Help',
      submenu: [
        {
          label: 'Get an OpenAI API Key…',
          click: () => shell.openExternal('https://platform.openai.com/api-keys')
        },
        {
          label: 'OpenAI Realtime API Docs…',
          click: () => shell.openExternal('https://platform.openai.com/docs/guides/realtime')
        },
        { type: 'separator' as const },
        {
          label: 'OpenAI Pricing…',
          click: () => shell.openExternal('https://openai.com/api/pricing/')
        },
        { type: 'separator' as const },
        {
          label: 'About AI Music Feedback…',
          click: () => shell.openExternal('https://github.com/aleph-void/AI-Music-Feedback')
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
