// Web-server + SSE oqimi + Cloudflare HTTPS tunnel (Telefonda 3D uyni ochish uchun)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const store = require('./store');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.apk': 'application/vnd.android.package-archive',
};

const ROOT = path.join(__dirname, '..');
const RENDERER = path.join(__dirname, 'renderer');

function startWebServer({ getBotStatus, onWebAction, port = Number(process.env.PORT) || 3847 }) {
  const clients = new Set();
  let publicUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || null;
  let eventSeq = 0;
  const recentEvents = [];

  const pushEvent = (ch, data) => {
    eventSeq += 1;
    const item = { seq: eventSeq, ch, data, at: Date.now() };
    recentEvents.push(item);
    if (recentEvents.length > 25) recentEvents.shift();
    return item;
  };

  const broadcast = (ch, data, seq = null) => {
    const pad = ':' + ' '.repeat(2048) + '\n';
    const msg = `data: ${JSON.stringify({ ch, data, seq })}\n\n${pad}`;
    for (const res of clients) {
      try {
        res.write(msg);
      } catch {
        clients.delete(res);
      }
    }
  };

  store.on('change', () => {
    broadcast('members:update', store.all());
    broadcast('home:update', store.getHome());
  });
  store.on('joined', (m) => {
    const ev = pushEvent('member:joined', m);
    broadcast('member:joined', m, ev.seq);
  });
  store.on('moved', (p) => {
    const ev = pushEvent('member:moved', p);
    broadcast('member:moved', p, ev.seq);
  });
  store.on('say', (p) => {
    const ev = pushEvent('member:say', p);
    broadcast('member:say', p, ev.seq);
  });
  store.on('voice', (p) => {
    const ev = pushEvent('member:voice', p);
    broadcast('member:voice', p, ev.seq);
  });

  const server = http.createServer((req, res) => {
    if (!publicUrl && req.headers['x-forwarded-proto'] === 'https' && req.headers.host) {
      publicUrl = `https://${req.headers.host}`;
    }
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(u.pathname);

    // 1. SSE jonli oqim
    if (pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(':' + ' '.repeat(2048) + '\n\n');
      res.write(`data: ${JSON.stringify({ ch: 'members:update', data: store.all() })}\n\n`);
      res.write(`data: ${JSON.stringify({ ch: 'home:update', data: store.getHome() })}\n\n`);
      res.write(`data: ${JSON.stringify({ ch: 'bot:status', data: getBotStatus() })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    // 2. Holat ma'lumotlari
    if (pathname === '/api/state' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      });
      res.end(
        JSON.stringify({
          members: store.all(),
          home: store.getHome(),
          bot: getBotStatus(),
          publicUrl,
          events: recentEvents,
        })
      );
      return;
    }

    // 2.5 Ilovani yuklab olish va Telegram hisobiga bog'lash sahifasi
    if (pathname === '/app') {
      const uid = u.searchParams.get('uid') || '';
      const name = u.searchParams.get('name') || '';
      const m = store.get(uid);
      const displayName = name || m?.name || 'Oila a\'zosi';
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      });
      res.end(`<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Oilaviy Uy - Datchikni ulash</title>
  <style>
    body { margin: 0; padding: 24px 16px; background: #0f0c24; color: white; font-family: system-ui, -apple-system, sans-serif; text-align: center; }
    .card { background: #181432; border-radius: 24px; padding: 24px; max-width: 420px; margin: 0 auto; box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
    h1 { font-size: 26px; margin: 12px 0 6px; }
    .badge { display: inline-block; background: #1e1b4b; border: 1px solid #10b981; color: #10b981; font-weight: bold; border-radius: 20px; padding: 8px 16px; margin-bottom: 16px; font-size: 14px; }
    .user { font-size: 22px; font-weight: bold; color: #38bdf8; margin-bottom: 20px; }
    .step-box { text-align: left; background: #110e26; border-radius: 16px; padding: 14px 16px; margin-bottom: 14px; border: 1px solid #231c44; }
    .step-num { font-weight: bold; color: #38bdf8; font-size: 15px; margin-bottom: 4px; }
    .step-desc { font-size: 14px; color: #cbd5e1; line-height: 1.4; margin-bottom: 10px; }
    .btn { display: block; width: 100%; box-sizing: border-box; padding: 16px; border-radius: 14px; font-size: 16px; font-weight: bold; text-decoration: none; border: none; cursor: pointer; text-align: center; }
    .btn-download { background: #3b82f6; color: white; }
    .btn-connect { background: #10b981; color: white; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 56px;">🏠</div>
    <h1>Oilaviy Uy</h1>
    <div class="badge">🟢 24/7 Fon GPS Datchigi</div>
    <div class="user">👤 ${displayName}</div>

    <div class="step-box">
      <div class="step-num">1-qadam:</div>
      <div class="step-desc">Ilovani yuklab oling va telefonga o'rnating.</div>
      <a href="/Oilaviy_Uy.apk" class="btn btn-download">📥 1. Ilovani yuklab olish (.apk)</a>
    </div>

    <div class="step-box">
      <div class="step-num">2-qadam:</div>
      <div class="step-desc">O'rnatgach, pastdagi tugmani bosing — ilova to'g'ridan-to'g'ri sizning Telegram hisobingizga ulanadi!</div>
      <a href="oilaviyuy://connect?uid=${uid}&name=${encodeURIComponent(displayName)}" class="btn btn-connect">🔗 2. Ilovani hisobimga bog'lash</a>
    </div>
  </div>
</body>
</html>`);
      return;
    }

    // 2.6 Qurilmani 6 xonali kod orqali Telegramga ulash API lari
    if (pathname === '/api/pair/request' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { if (body.length < 2048) body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const code = store.createPairCode(payload.deviceId || '');
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, code, expiresIn: 900 }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
        }
      });
      return;
    }

    if (pathname === '/api/pair/status' && req.method === 'GET') {
      const code = u.searchParams.get('code') || '';
      const deviceId = u.searchParams.get('deviceId') || '';
      const status = store.getPairStatus(code, deviceId);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, ...status }));
      return;
    }

    // 3. 3D Xonadan personaj ustiga bosib xabar yozish yoki holat o'zgartirish
    if (pathname === '/api/action' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        if (body.length < 5 * 1024 * 1024) body += chunk;
      });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          await onWebAction?.(payload);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
        }
      });
      return;
    }

    // 4. Statik fayllar (renderer, node_modules va yuklangan rasmlar)
    let filePath;
    if (pathname === '/' || pathname === '/index.html') {
      filePath = path.join(RENDERER, 'index.html');
    } else if (pathname.startsWith('/node_modules/')) {
      filePath = path.join(ROOT, pathname);
    } else if (pathname.startsWith('/photos/')) {
      filePath = path.join(ROOT, 'data', pathname);
    } else {
      filePath = path.join(RENDERER, pathname);
    }

    // Xavfsizlik tekshiruvi
    const resolved = path.resolve(filePath);
    const allowedRoots = [
      path.resolve(RENDERER),
      path.resolve(path.join(ROOT, 'node_modules')),
      path.resolve(path.join(ROOT, 'data', 'photos')),
    ];
    if (!allowedRoots.some((dir) => resolved.startsWith(dir))) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(resolved, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(resolved).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      });
      res.end(data);
    });
  });

  let activePort = port;
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      activePort += 1;
      console.warn(`⚠️ Port band, yangi port sinab ko'rilmoqda: ${activePort}`);
      setTimeout(() => server.listen(activePort, '0.0.0.0'), 200);
    } else {
      console.error('Web-server xatosi:', err.message);
    }
  });

  server.listen(activePort, '0.0.0.0', () => {
    console.log(`🌐 3D Xona Web-serveri: http://localhost:${activePort}`);
    if (publicUrl) {
      console.log(`📱 Bulutli 3D Xona havolasi: ${publicUrl}`);
    } else {
      startCloudflareTunnel(activePort, (url) => {
        publicUrl = url;
        console.log(`📱 Telefon uchun 3D Xona havolasi: ${url}`);
        broadcast('tunnel', { url });
      });
    }
  });

  return {
    getPublicUrl: () => publicUrl || `http://localhost:${activePort}`,
    notifyBotStatus: (s) => broadcast('bot:status', s),
    close: () => server.close(),
  };
}

function startCloudflareTunnel(port, onUrl) {
  try {
    const { bin } = require('cloudflared');
    if (!fs.existsSync(bin)) return;
    const child = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const onChunk = (buf) => {
      const str = buf.toString();
      const match = str.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match) onUrl(match[0]);
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    process.on('exit', () => child.kill());
  } catch (err) {
    console.error('Tunnel xatosi:', err.message);
  }
}

module.exports = { startWebServer };
