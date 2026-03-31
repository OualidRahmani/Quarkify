const { app, BrowserWindow } = require('electron');
const path = require('path');

// --- THE FIX: Only load chokidar if we are in Development ---
let chokidar;
if (!app.isPackaged) {
    chokidar = require('chokidar');
}

app.disableHardwareAcceleration();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, 
    backgroundColor: '#121212',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, 
      webviewTag: true
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools only if we are in development mode!
  if (!app.isPackaged) {
      mainWindow.webContents.openDevTools();
  }

  // --- THE FIX: Only run the Watcher if we are in Development ---
  if (!app.isPackaged && chokidar) {
      const userCssPath = path.join(__dirname, '../styles/user.css');
      chokidar.watch(userCssPath).on('change', () => {
        console.log("Custom CSS changed! Reloading styles...");
        mainWindow.webContents.send('reload-styles');
      });
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});