// Shared helpers for browser tests. node --test runs e2e files in parallel,
// so each file must start its own server on a free port.
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

/** A TCP port that is free right now. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

/**
 * Start the static dev server on a free port and wait until it answers.
 * Returns { url, port, close }.
 */
async function startServer(env = {}) {
  const port = await freePort();
  const url = `http://localhost:${port}/`;
  const child = spawn(process.execPath, [path.join(__dirname, '../../scripts/serve.js')], {
    env: { ...process.env, ...env, PORT: String(port) }, stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { await fetch(url); return { url, port, close: () => child.kill() }; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  child.kill();
  throw new Error(`dev server did not start on port ${port}`);
}

module.exports = { freePort, startServer };
