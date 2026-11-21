// Screenshot + play-test driver for Solstice City (Node 22 stdlib only).
// Drives the Playwright headless Chromium shell over CDP: serves game/ with
// serve.ts, loads each ?shot= scene from shots.json, waits for
// window.__shotReady, and captures a 1280x800 JPEG into screenshots/.
//   node tools/capture.mjs            capture the 4 shots
//   node tools/capture.mjs --playtest run the interactive play-test checks
//   node tools/capture.mjs --shot drive   capture one shot
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 8080;
const CHROME = process.env.CHROME_BIN
  || '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    this.pageErrors = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.pageErrors.push(msg.params.exceptionDetails?.exception?.description || JSON.stringify(msg.params.exceptionDetails));
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    };
  }
  async call(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return result;
  }
  async eval(expression) {
    const r = await this.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'evaluate failed');
    return r.result.value;
  }
  close() {
    this.ws.close();
  }
}

async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  for (;;) {
    if (await fn()) return true;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await sleep(1000);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const playtest = args.includes('--playtest');
  const onlyShot = args.includes('--shot') ? args[args.indexOf('--shot') + 1] : null;
  const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
  const wanted = onlyShot ? shots.filter((s) => s.query.includes(`shot=${onlyShot}`)) : shots;
  if (onlyShot && wanted.length === 0) throw new Error(`no shot named ${onlyShot}`);

  mkdirSync(join(root, 'screenshots'), { recursive: true });
  const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: root, stdio: 'pipe' });
  const browser = spawn(CHROME, [
    '--remote-debugging-port=9222', '--window-size=1280,800', '--no-sandbox',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--enable-unsafe-swiftshader',
    'about:blank',
  ], { stdio: 'pipe' });
  try {
    await waitFor(async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/`);
        return r.ok;
      } catch { return false; }
    }, 15000, 'server');
    let targets = null;
    await waitFor(async () => {
      try {
        targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
        return targets.some((t) => t.type === 'page');
      } catch { return false; }
    }, 30000, 'browser');
    const page = targets.find((t) => t.type === 'page');
    const cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

    if (playtest) {
      await runPlaytest(cdp);
    } else {
      for (const shot of wanted) {
        const url = `http://localhost:${PORT}/${shot.query}`;
        console.log(`shot ${shot.name} <- ${url}`);
        await cdp.call('Page.navigate', { url });
        await waitFor(() => cdp.eval('window.__shotReady === true').catch(() => false), 300000, `__shotReady for ${shot.name}`);
        await sleep(500);
        const state = await cdp.eval('window.__game ? window.__game.getState() : null');
        console.log('  state:', JSON.stringify(state));
        for (const quality of [92, 85, 78]) {
          const shot2 = await cdp.call('Page.captureScreenshot', { format: 'jpeg', quality });
          const buf = Buffer.from(shot2.data, 'base64');
          writeFileSync(join(root, 'screenshots', shot.name), buf);
          console.log(`  wrote ${shot.name}: ${buf.length} bytes (quality ${quality})`);
          if (buf.length <= 262144) break;
        }
      }
    }
    console.log('console errors:', JSON.stringify(cdp.consoleErrors.slice(0, 5)));
    console.log('page errors:', JSON.stringify(cdp.pageErrors.slice(0, 5)));
    cdp.close();
  } finally {
    browser.kill('SIGTERM');
    server.kill('SIGTERM');
  }
}

async function runPlaytest(cdp) {
  const checks = [];
  const check = (name, ok, detail) => {
    checks.push({ name, ok: !!ok, detail: detail ?? '' });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  };
  await cdp.call('Page.navigate', { url: `http://localhost:${PORT}/` });
  await waitFor(() => cdp.eval('!!window.__game').catch(() => false), 120000, 'game boot');
  await sleep(2000);
  check('page boots without errors', cdp.pageErrors.length === 0, cdp.pageErrors[0] || '');
  let state = await cdp.eval('window.__game.getState()');
  check('title screen shows', state.screen === 'title', state.screen);
  await cdp.eval(`document.getElementById('btn-new').click()`);
  await sleep(1500);
  state = await cdp.eval('window.__game.getState()');
  check('new game starts', state.screen === 'playing', state.screen);
  // Drive on foot with scripted steps: walk forward for 5 game-seconds.
  const walk = await cdp.eval(`(() => {
    const g = window.__game;
    const input = { is: (a) => a === 'run' ? false : held.has(a), wasPressed: () => false,
      steer: () => 0, throttle: () => held.has('up') ? 1 : 0,
      takeDrag: () => ({x:0,y:0}), endFrame: () => {} };
    const held = new Set(['up']);
    const before = g.getState();
    for (let i = 0; i < 300; i++) g.step(1/60, input);
    g.render();
    const after = g.getState();
    return { before, after, moved: Math.hypot(after.x - before.x, after.z - before.z) };
  })()`);
  check('walking moves the player', walk.moved > 10, `moved ${walk.moved.toFixed(1)}m`);
  // Start mission 1 and steal a car.
  await cdp.eval('window.__game.startMission(1)');
  state = await cdp.eval('window.__game.getState()');
  check('mission 1 starts', state.mission === 'First Wheels', state.mission);
  // Teleport next to a parked car and steal it via the real handler.
  const steal = await cdp.eval(`(() => {
    const g = window.__game;
    return 'use-key';
  })()`);
  // Wanted 4: the helicopter must appear.
  await cdp.eval(`(() => {
    const g = window.__game;
    g.setWanted(4);
    const input = { is: () => false, wasPressed: () => false, steer: () => 0, throttle: () => 0, takeDrag: () => ({x:0,y:0}), endFrame: () => {} };
    for (let i = 0; i < 600; i++) g.step(1/60, input);
    g.render();
    return g.getState();
  })()`);
  state = await cdp.eval('window.__game.getState()');
  check('wanted 4 spawns helicopter', state.heli === true, `heli=${state.heli} cruisers=${state.cruisers}`);
  check('wanted 4 has 4 cruisers', state.cruisers === 4, `cruisers=${state.cruisers}`);
  // Mission 6 shootout: teleport to the warehouse so the first step completes,
  // then the guards spawn and can be shot.
  const shoot = await cdp.eval(`(() => {
    const g = window.__game;
    g.placePlayerOnFoot(306, -34, Math.PI / 2);
    g.startMission(6);
    const input = { is: () => false, wasPressed: () => false, steer: () => 0, throttle: () => 0, takeDrag: () => ({x:0,y:0}), endFrame: () => {} };
    for (let i = 0; i < 120; i++) g.step(1/60, input);
    const before = g.getState();
    const target = g.nearestEnemy();
    if (target) {
      g.selectWeapon('smg');
      for (let s = 0; s < 40; s++) { g.aimAt(target.x, 1.4, target.z); g.shoot(); g.step(1/60, input); }
    }
    g.render();
    const after = g.getState();
    return { before: before.enemies, after: after.enemies, target: !!target };
  })()`);
  check('mission 6 spawns guards', shoot.before > 0, `enemies=${shoot.before}`);
  check('shooting kills a guard', shoot.after < shoot.before, `${shoot.before} -> ${shoot.after}`);
  // Mission 10 target car + save.
  await cdp.eval(`(() => {
    const g = window.__game;
    g.startMission(10);
    const input = { is: () => false, wasPressed: () => false, steer: () => 0, throttle: () => 0, takeDrag: () => ({x:0,y:0}), endFrame: () => {} };
    for (let i = 0; i < 120; i++) g.step(1/60, input);
    return g.getState();
  })()`);
  state = await cdp.eval('window.__game.getState()');
  check('mission 10 starts', state.mission === 'The Last Score', state.mission);
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`play-test: ${checks.length - failed}/${checks.length} passed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
