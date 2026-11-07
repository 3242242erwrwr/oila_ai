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

    // 3. 3D Xonadan personaj ustiga bosib xabar yozish yoki holat o'zgartirish
    if (pathname === '/api/action' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        if (body.length < 8192) body += chunk;
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

    // 4. Statik fayllar (renderer va node_modules)
    let filePath;
    if (pathname === '/' || pathname === '/index.html') {
      filePath = path.join(RENDERER, 'index.html');
    } else if (pathname.startsWith('/node_modules/')) {
      filePath = path.join(ROOT, pathname);
    } else {
      filePath = path.join(RENDERER, pathname);
    }

    // Xavfsizlik tekshiruvi
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(RENDERER)) && !resolved.startsWith(path.resolve(path.join(ROOT, 'node_modules')))) {
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
