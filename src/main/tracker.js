const { app, ipcMain } = require('electron');

module.exports = function initTracker(getWindow) {
    // 1. Restore the missing handler so the UI stops crashing!
    ipcMain.handle('get-memory-usage', () => {
        const metrics = app.getAppMetrics();
        const totalKb = metrics.reduce((acc, metric) => acc + metric.memory.workingSetSize, 0);
        return Math.round(totalKb / 1024);
    });

    // 2. Keep the push loop we added in the last step
    setInterval(() => {
        const win = getWindow();
        if (!win || !win.webContents) return;

        const metrics = app.getAppMetrics();
        const totalKb = metrics.reduce((acc, metric) => acc + metric.memory.workingSetSize, 0);
        const totalMb = Math.round(totalKb / 1024);

        win.webContents.send('update-ram', totalMb);
    }, 2000); 
};