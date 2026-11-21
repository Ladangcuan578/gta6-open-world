// Debug helper: load one ?shot= scene and log, every 5s, whether the page is
// alive, whether __shotReady appeared, and any console/page errors.
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 8081;
const CHROME = '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const shot = process.argv[2] || 'chase';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: root, stdio: 'pipe' });
const browser = spawn(CHROME, [
  '--remote-debugging-port=9223', '--window-size=1280,800', '--no-sandbox',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--enable-unsafe-swiftshader',
  'about:blank',
], { stdio: 'pipe' });

async function main() {
  await sleep(1500);
  let targets = null;
  for (let i = 0; i < 30; i += 1) {
    try {
      targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();
      if (targets.some((t) => t.type === 'page')) break;
    } catch { /* retry */ }
    await sleep(1000);
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails?.exception?.description || 'exception');
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJs = async (expr, timeoutMs = 8000) => {
    const r = await Promise.race([
      call('Runtime.evaluate', { expression: expr, returnByValue: true }),
      sleep(timeoutMs).then(() => ({ timeout: true })),
    ]);
    if (r.timeout) return { timeout: true };
    return r.result ? r.result.value : { error: r.exceptionDetails?.exception?.description };
  };
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `http://localhost:${PORT}/?shot=${shot}&seed=7` });
  const start = Date.now();
  for (let i = 0; i < 24; i += 1) {
    await sleep(5000);
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    const probe = await evalJs('({ ready: window.__shotReady === true, game: !!window.__game, now: Math.round(performance.now()) })');
    console.log(`${elapsed}s probe:`, JSON.stringify(probe), 'errors:', JSON.stringify(errors.slice(0, 3)));
    if (probe && probe.ready) break;
  }
  ws.close();
  browser.kill('SIGTERM');
  server.kill('SIGTERM');
  process.exit(0);
}
main().catch((e) => { console.error(e); browser.kill(); server.kill(); process.exit(1); });
