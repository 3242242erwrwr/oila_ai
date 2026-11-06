// Avtomatik ishga tushirgich:
// - Render (Linux bulutli server) da bo'lsa -> src/cloud.js ni ishga tushiradi
// - Windows PC da bo'lsa -> Electron oynasini ishga tushiradi
if (process.env.RENDER || process.platform !== 'win32') {
  require('./cloud.js');
} else {
  const { spawn } = require('child_process');
  const electronPath = require('electron');
  const child = spawn(electronPath, ['.'], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code || 0));
}
