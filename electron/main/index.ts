import { app, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc-handlers'
import { setupMenu } from './menu'

const isDev = !app.isPackaged

// Resolve icon relative to project root in dev, or app resources in production
const iconPath = isDev
  ? join(__dirname, '../../resources/icon.png')
  : join(process.resourcesPath, 'icon.png')

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 550,
    icon: iconPath,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: false // needed for preload to use Electron APIs
    }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// Content-Security-Policy enforced at the session level.
// Keeping unsafe-eval out of script-src is the key fix for the Electron
// security warning; Vue 3 + Vite do not need eval in the renderer process.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",   // Vue scoped styles inject at runtime
  "connect-src 'self' wss://api.openai.com https://api.openai.com",
  "img-src 'self' data:",
  "media-src 'self' mediastream:"
].join('; ')

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP]
      }
    })
  })

  registerIpcHandlers()
  let win: BrowserWindow | null = null
  setupMenu(() => win)
  win = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
