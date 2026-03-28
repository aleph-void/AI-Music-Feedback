import { app, BrowserWindow, session, desktopCapturer } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc-handlers'

const isDev = !app.isPackaged

function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 550,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: false // needed for preload to use Electron APIs
    }
  })

  // Required to allow getDisplayMedia() calls from the renderer for audio capture.
  // The handler provides a loopback audio source for system audio.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then(sources => {
      if (sources.length > 0) {
        callback({
          video: sources[0],
          audio: 'loopback' // captures system/soundcard audio on Windows
          // On macOS: requires Screen Recording permission
          // On Linux: requires PipeWire
        })
      } else {
        callback({})
      }
    })
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

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
