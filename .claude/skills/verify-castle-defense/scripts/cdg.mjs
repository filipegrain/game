#!/usr/bin/env node
// cdg: drive Castle Defense in a headless Chrome over the DevTools protocol. Zero npm dependencies (Node 22+).
// Run `node cdg.mjs help` for commands. State for the running instance lives in <repo>/.verify/state.json.

import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const VERIFY = path.join(REPO, '.verify');
const STATE = path.join(VERIFY, 'state.json');
const VIEW_W = 1280, VIEW_H = 720;

const HELP = `cdg — drive Castle Defense (headless Chrome + CDP)

  launch [--headed]          start static server + Chrome on free ports, wait for MenuScene
  doctor                     read-only health check of the instance this checkout launched
  start <hero> <difficulty>  MenuScene -> GameScene (warrior|mage, easy|medium|hard) via the START flow
  state                      compact JSON snapshot of scenes and game state
  eval <js>                  evaluate JS in the page (globals: game, CONFIG, ...); prints JSON result
  wait <js> [timeoutMs]      poll until the JS expression is truthy (default 10000 ms)
  key <Code> [--down|--up] [--hold ms]   key press by KeyboardEvent.code (KeyQ, Digit1, Space, Escape, Enter...)
  move <x> <y>               move the mouse to game coords (1280x720 canvas space)
  click <x> <y> [left|right] click at game coords
  wclick <wx> <wy> [left|right]  click at WORLD coords (converted through the GameScene camera)
  wmove <wx> <wy>            move the mouse to WORLD coords
  shot <file.png>            screenshot (relative paths go under .verify/artifacts/)
  logs [--clear]             console errors/warnings + uncaught exceptions captured since launch
  stop                       kill the server and Chrome this checkout launched; keeps .verify/artifacts
`;

// ---------------------------------------------------------------- utils
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const die = (msg) => { console.error('cdg: ' + msg); process.exit(1); };
const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const artifact = (p) => path.isAbsolute(p) ? p : path.join(VERIFY, 'artifacts', p);

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    s.on('error', rej);
  });
}

function getJSON(url) {
  return new Promise((res, rej) => {
    http.get(url, (r) => { let b = ''; r.on('data', d => b += d); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}

function findChrome() {
  const c = [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return c.find(p => p && fs.existsSync(p)) || die('no Chrome/Edge found; set CHROME_PATH');
}

function killTree(pid) {
  if (!alive(pid)) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-pid, 'SIGKILL');
  } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
}

// ---------------------------------------------------------------- CDP
async function connect() {
  const st = readState();
  if (!st) die('no instance; run `cdg launch` first');
  if (!alive(st.chromePid) || !alive(st.serverPid)) die('instance in .verify/state.json is dead; run `cdg stop` then `cdg launch`');
  const targets = await getJSON(`http://127.0.0.1:${st.cdpPort}/json/list`);
  const t = targets.find(t => t.type === 'page' && t.url.startsWith(st.url));
  if (!t) die('game page not found among Chrome targets');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP websocket failed')); });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  return { st, send, close: () => ws.close() };
}

async function evaluate(c, expr) {
  const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page exception: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}

// game coords (1280x720) -> CSS pixels
async function toCss(c, x, y) {
  const r = await evaluate(c, `(() => { const b = game.canvas.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; })()`);
  return { x: r.l + x * r.w / VIEW_W, y: r.t + y * r.h / VIEW_H };
}

async function worldToGame(c, wx, wy) {
  return evaluate(c, `(() => { const gs = game.scene.getScene('GameScene'); if (!game.scene.isActive('GameScene')) throw new Error('GameScene not active'); const cam = gs.cameras.main; return { x: ${wx} - cam.scrollX, y: ${wy} - cam.scrollY }; })()`);
}

async function mouse(c, type, x, y, button = 'none') {
  const p = await toCss(c, x, y);
  const buttons = { none: 0, left: 1, right: 2 }[button];
  await c.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button, buttons: type === 'mouseReleased' ? 0 : buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
}

async function click(c, x, y, button = 'left') {
  await mouse(c, 'mouseMoved', x, y);
  await mouse(c, 'mousePressed', x, y, button);
  await sleep(30);
  await mouse(c, 'mouseReleased', x, y, button);
}

function keyInfo(code) {
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return { key: m[1].toLowerCase(), vk: m[1].charCodeAt(0), text: m[1].toLowerCase() };
  if ((m = /^Digit([0-9])$/.exec(code))) return { key: m[1], vk: 48 + +m[1], text: m[1] };
  const t = { Space: [' ', 32, ' '], Enter: ['Enter', 13, '\r'], Escape: ['Escape', 27], Tab: ['Tab', 9], ShiftLeft: ['Shift', 16], ControlLeft: ['Control', 17] }[code];
  if (!t) die('unknown key code ' + code);
  return { key: t[0], vk: t[1], text: t[2] };
}

async function key(c, code, phase, hold = 30) {
  const k = keyInfo(code);
  const base = { code, key: k.key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk };
  if (phase !== 'up') await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(k.text ? { text: k.text } : {}) });
  if (phase) return;
  await sleep(hold);
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

const STATE_JS = `(() => {
  const active = game.scene.getScenes(true).map(s => s.scene.key);
  const out = { active };
  if (!game.scene.isActive('GameScene')) return out;
  const gs = game.scene.getScene('GameScene'), h = gs.hero, k = gs.keep, w = gs.waves;
  const r = (v) => Math.round(v * 10) / 10;
  Object.assign(out, {
    hero: { key: gs.heroKey, alive: h.alive, x: r(h.x), y: r(h.y), hp: r(h.hp), maxHp: h.maxHp, level: h.level, xp: h.xp, xpToNext: gs.leveling.xpToNext(),
            cooldowns: Object.fromEntries(Object.entries(h.cooldowns).map(([a, b]) => [a, r(b)])), aiming: h.aiming,
            order: h.order ? h.order.type || true : null, items: h.itemLevels },
    keep: { hp: r(k.hp), maxHp: k.maxHp, tier: k.tier },
    difficulty: gs.diffKey, gold: gs.economy.gold, wave: w.wave, nextWaveIn: r(w.timer),
    enemies: gs.enemies.filter(e => e.alive && !e.neutral).length, neutrals: gs.enemies.filter(e => e.alive && e.neutral).length,
    towers: gs.towers.filter(t => t.alive).map(t => ({ lane: t.lane, order: t.order, hp: r(t.hp) })), allies: gs.allies.filter(a => a.alive).length,
    buildings: gs.buildings.map(b => ({ type: b.type, level: b.level, tx: b.tx, ty: b.ty })),
    placing: gs.build.placing, selected: gs.build.selected ? (gs.build.selected === k ? 'keep' : gs.build.selected.type) : null,
    picks: gs.picks.choices, paused: gs.paused, ended: gs.ended, stats: { ...gs.stats, time: r(gs.stats.time) },
    camera: { x: r(gs.cameras.main.scrollX), y: r(gs.cameras.main.scrollY) },
  });
  return out;
})()`;

// Captures console errors/warnings and uncaught exceptions into window.__cdLog before any game script runs.
const LOG_HOOK = `(() => {
  const log = window.__cdLog = [];
  const push = (level, args) => log.push({ t: Math.round(performance.now()), level, msg: args.map(a => a instanceof Error ? a.stack : typeof a === 'object' ? (() => { try { return JSON.stringify(a); } catch { return String(a); } })() : String(a)).join(' ') });
  for (const lv of ['error', 'warn']) { const o = console[lv]; console[lv] = (...a) => { push(lv, a); o.apply(console, a); }; }
  window.addEventListener('error', e => push('exception', [e.error || e.message]));
  window.addEventListener('unhandledrejection', e => push('exception', [e.reason]));
})()`;

// ---------------------------------------------------------------- static server (child process)
function serve(root, port) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  }).listen(port, '127.0.0.1');
}

// ---------------------------------------------------------------- commands
async function launch(headed) {
  const old = readState();
  if (old && (alive(old.chromePid) || alive(old.serverPid))) die(`an instance from this checkout is already running (${old.url}); run \`cdg stop\` first`);
  fs.mkdirSync(path.join(VERIFY, 'artifacts'), { recursive: true });
  const port = await freePort(), cdpPort = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdg-profile-'));
  const opts = { detached: true, stdio: 'ignore', windowsHide: true };
  const server = spawn(process.execPath, [fileURLToPath(import.meta.url), '__serve', REPO, String(port)], opts);
  server.unref();
  const chromeArgs = [`--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', `--window-size=${VIEW_W},${VIEW_H}`, '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'];
  if (!headed) chromeArgs.unshift('--headless=new');
  const chrome = spawn(findChrome(), chromeArgs, opts);
  chrome.unref();
  const st = { url, port, cdpPort, serverPid: server.pid, chromePid: chrome.pid, profile, repo: REPO, startedAt: new Date().toISOString(),
    commit: (() => { try { return execFileSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch { return null; } })() };
  fs.writeFileSync(STATE, JSON.stringify(st, null, 2));

  // wait for CDP, then load the game with the log hook installed first
  let blank;
  for (let i = 0; i < 100 && !blank; i++) {
    try { blank = (await getJSON(`http://127.0.0.1:${cdpPort}/json/list`)).find(t => t.type === 'page'); } catch { /* not up yet */ }
    if (!blank) await sleep(100);
  }
  if (!blank) die('Chrome did not expose a DevTools page');
  const ws = new WebSocket(blank.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: LOG_HOOK });
  await send('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  // ready = Phaser booted and MenuScene running (the game is usable, not just the page loaded)
  const t0 = Date.now();
  for (;;) {
    const r = await send('Runtime.evaluate', { expression: `typeof game !== 'undefined' && game.isBooted && game.scene.isActive('MenuScene')`, returnByValue: true });
    if (r.result?.result?.value === true) break;
    if (Date.now() - t0 > 20000) { ws.close(); die('game did not reach MenuScene within 20s (Phaser loads from a CDN: is the network up?). Run `cdg logs`.'); }
    await sleep(200);
  }
  ws.close();
  console.log(JSON.stringify({ ready: true, ...st }, null, 2));
}

async function doctor() {
  const st = readState();
  const out = { stateFile: STATE, ok: false };
  if (!st) { out.problem = 'no instance launched from this checkout'; console.log(JSON.stringify(out, null, 2)); process.exit(1); }
  Object.assign(out, { url: st.url, repo: st.repo, launchedAt: st.startedAt, launchedCommit: st.commit, serverAlive: alive(st.serverPid), chromeAlive: alive(st.chromePid) });
  out.sameRepo = path.resolve(st.repo) === REPO;
  try { out.currentCommit = execFileSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch { /* no git */ }
  if (out.serverAlive) {
    try {
      const body = await new Promise((res, rej) => http.get(st.url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(b)); }).on('error', rej));
      out.servesThisRepo = body === fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
    } catch (e) { out.servesThisRepo = false; }
  }
  if (out.chromeAlive) {
    try {
      const c = await connect();
      Object.assign(out, await evaluate(c, `({ phaser: typeof Phaser !== 'undefined' ? Phaser.VERSION : null, booted: typeof game !== 'undefined' && game.isBooted,
        scenes: typeof game !== 'undefined' ? game.scene.getScenes(true).map(s => s.scene.key) : [], renderer: typeof game !== 'undefined' ? (game.renderer.type === 2 ? 'WEBGL' : 'CANVAS') : null,
        errors: (window.__cdLog || []).filter(l => l.level !== 'warn').length })`));
      c.close();
    } catch (e) { out.cdpError = e.message; }
  }
  out.ok = !!(out.serverAlive && out.chromeAlive && out.sameRepo && out.servesThisRepo && out.booted && out.phaser === '3.80.1');
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

async function stop() {
  const st = readState();
  if (!st) { console.log('nothing to stop'); return; }
  killTree(st.chromePid); killTree(st.serverPid);
  await sleep(300);
  try { fs.rmSync(st.profile, { recursive: true, force: true }); } catch { /* chrome may still hold files briefly */ }
  fs.rmSync(STATE, { force: true });
  console.log(`stopped server ${st.serverPid} and chrome ${st.chromePid}; artifacts kept in ${path.join(VERIFY, 'artifacts')}`);
}

async function main() {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === '__serve') return serve(a[0], +a[1]);
  if (!cmd || cmd === 'help' || cmd === '--help') { console.log(HELP); return; }
  if (cmd === 'launch') return launch(a.includes('--headed'));
  if (cmd === 'doctor') return doctor();
  if (cmd === 'stop') return stop();

  const c = await connect();
  try {
    switch (cmd) {
      case 'state': console.log(JSON.stringify(await evaluate(c, STATE_JS), null, 2)); break;
      case 'eval': console.log(JSON.stringify(await evaluate(c, a.join(' ')), null, 2)); break;
      case 'wait': {
        const ms = +(a[1] || 10000), t0 = Date.now();
        for (;;) {
          let v; try { v = await evaluate(c, a[0]); } catch (e) { v = false; }
          if (v) { console.log(JSON.stringify({ ok: true, value: v, ms: Date.now() - t0 })); break; }
          if (Date.now() - t0 > ms) { console.log(JSON.stringify({ ok: false, timeoutMs: ms, expr: a[0] })); process.exitCode = 1; break; }
          await sleep(100);
        }
        break;
      }
      case 'start': {
        const [hero, diff] = a;
        if (!['warrior', 'mage'].includes(hero) || !['easy', 'medium', 'hard'].includes(diff)) die('usage: start <warrior|mage> <easy|medium|hard>');
        if (!(await evaluate(c, `game.scene.isActive('MenuScene')`))) die('MenuScene is not active');
        // hero cards: warrior at (340,180), mage at (660,180), 280x270. Difficulty buttons at x=400+i*170, y=490, 150x44. START at (540,570) 200x54.
        await click(c, hero === 'warrior' ? 480 : 800, 300);
        await click(c, 400 + ['easy', 'medium', 'hard'].indexOf(diff) * 170 + 75, 512);
        await click(c, 640, 597);
        const t0 = Date.now();
        while (!(await evaluate(c, `game.scene.isActive('GameScene') && game.scene.isActive('UIScene')`))) {
          if (Date.now() - t0 > 5000) die('GameScene did not start');
          await sleep(100);
        }
        console.log(JSON.stringify(await evaluate(c, `(() => { const gs = game.scene.getScene('GameScene'); return { hero: gs.heroKey, difficulty: gs.diffKey, gold: gs.economy.gold }; })()`)));
        break;
      }
      case 'key': {
        const phase = a.includes('--down') ? 'down' : a.includes('--up') ? 'up' : null;
        const hi = a.indexOf('--hold');
        await key(c, a[0], phase, hi >= 0 ? +a[hi + 1] : 30);
        break;
      }
      case 'move': await mouse(c, 'mouseMoved', +a[0], +a[1]); break;
      case 'click': await click(c, +a[0], +a[1], a[2] || 'left'); break;
      case 'wmove': { const p = await worldToGame(c, +a[0], +a[1]); await mouse(c, 'mouseMoved', p.x, p.y); break; }
      case 'wclick': {
        const p = await worldToGame(c, +a[0], +a[1]);
        if (p.x < 0 || p.y < 0 || p.x > VIEW_W || p.y > VIEW_H) die(`world point is off screen (game coords ${Math.round(p.x)},${Math.round(p.y)}); pan the camera there first (minimap click, or hold Space to centre on the hero)`);
        await click(c, p.x, p.y, a[2] || 'left');
        break;
      }
      case 'shot': {
        const f = artifact(a[0] || `shot-${Date.now()}.png`);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        const r = await c.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
        console.log(f);
        break;
      }
      case 'logs': {
        console.log(JSON.stringify(await evaluate(c, `window.__cdLog || []`), null, 2));
        if (a.includes('--clear')) await evaluate(c, `(window.__cdLog || []).length = 0`);
        break;
      }
      default: die('unknown command ' + cmd + '\n' + HELP);
    }
  } finally { c.close(); }
}

main().catch(e => die(e.stack || e.message));
