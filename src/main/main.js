const { app, BrowserWindow } = require('electron');
const path = require('path');
const chokidar = require('chokidar');

app.disableHardwareAcceleration();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, // This hides the default Linux/Windows title bar
    backgroundColor: '#121212',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Simplifies our initial UI communication
      webviewTag: true, // Enable webview support for embedded content
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.webContents.openDevTools();

  // The Watcher: Listens for changes in user.css
  const userCssPath = path.join(__dirname, '../styles/user.css');
  chokidar.watch(userCssPath).on('change', () => {
    console.log("Custom CSS changed! Reloading styles...");
    mainWindow.webContents.send('reload-styles');
  });
}

app.whenReady().then(createWindow);

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});