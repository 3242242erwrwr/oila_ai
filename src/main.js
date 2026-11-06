const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { app, BrowserWindow, ipcMain, session } = require('electron');
const store = require('./store');
const { startBot, stopBot, handleRoomAction } = require('./bot');
const { startWebServer } = require('./server');

let win = null;
let webServer = null;
let botStatus = { ok: false, connecting: true };

// Ikki marta ochilganda xatolik chiqmasligi va bot to'qnashmasligi uchun yagona nusxa qulfi
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

function setBotStatus(s) {
  botStatus = s;
  send('bot:status', s);
  webServer?.notifyBotStatus(s);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1b2e',
    title: 'Oilaviy Uy',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Dasturchi uchun: SCREENSHOT=fayl.png bilan ishga tushirilsa, rasm olib yopiladi
  if (process.env.SCREENSHOT) {
    win.webContents.on('console-message', (e) => console.log('[renderer]', e.message));
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        require('fs').writeFileSync(process.env.SCREENSHOT, img.toPNG());
        app.quit();
      }, Number(process.env.SCREENSHOT_DELAY || 4000));
    });
  }
}

app.whenReady().then(() => {
  if (!gotLock) return;
  // Xarita plitkalari (OpenStreetMap) bloklanmasligi uchun Referer va User-Agent beramiz
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://*.tile.openstreetmap.org/*', 'https://tile.openstreetmap.org/*', 'https://*.basemaps.cartocdn.com/*'] },
    (details, callback) => {
      details.requestHeaders['User-Agent'] = 'FamilyHomeDesktopApp/1.0 (https://family-home.app)';
      details.requestHeaders['Referer'] = 'https://family-home.app/';
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  store.load();

  ipcMain.handle('members:get', () => store.all());
  ipcMain.handle('home:get', () => store.getHome());
  ipcMain.handle('bot:status', () => botStatus);
  ipcMain.handle('room:action', (_e, payload) => handleRoomAction(payload));

  webServer = startWebServer({
    getBotStatus: () => botStatus,
    onWebAction: handleRoomAction,
  });

  store.on('change', () => {
    send('home:update', store.getHome());
    send('members:update', store.all());
  });
  store.on('joined', (m) => send('member:joined', m));
  store.on('say', (p) => send('member:say', p));
  store.on('moved', (p) => send('member:moved', p));

  createWindow();

  startBot(process.env.BOT_TOKEN, setBotStatus, {
    getPublicUrl: () => webServer.getPublicUrl(),
  }).catch((err) => {
    console.error(err);
    setBotStatus({ ok: false, error: String(err.message || err) });
  });
});

app.on('window-all-closed', async () => {
  await stopBot();
  app.quit();
});
