// Bulutli server (Render.com / 24/7) uchun asosiy fayl (Electronsiz ishlaydi)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const store = require('./store');
const { startBot, stopBot, handleRoomAction } = require('./bot');
const { startWebServer } = require('./server');

let botStatus = { ok: false, connecting: true };
let webServer = null;

function setBotStatus(s) {
  botStatus = s;
  webServer?.notifyBotStatus(s);
}

store.load();

webServer = startWebServer({
  getBotStatus: () => botStatus,
  onWebAction: handleRoomAction,
  port: Number(process.env.PORT) || 3847,
});

startBot(process.env.BOT_TOKEN, setBotStatus, {
  getPublicUrl: () => webServer.getPublicUrl(),
}).catch((err) => {
  console.error('Bot xatosi:', err);
  setBotStatus({ ok: false, error: String(err.message || err) });
});

// Render bepul tarifida server uxlab qolmasligi uchun har 10 daqiqada o'zini uyg'otib turadi (Auto-ping)
setInterval(() => {
  const url = webServer?.getPublicUrl();
  if (url && url.startsWith('https://')) {
    fetch(`${url}/api/state`).catch(() => {});
  }
}, 10 * 60 * 1000);

process.on('SIGTERM', async () => {
  await stopBot();
  process.exit(0);
});
