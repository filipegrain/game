// Profile the balance simulation in the headless Chrome that `cdg launch` started.
// Starts one sim run, records a CPU profile for N seconds, prints sim speed and the top self-time functions.
// Usage: node .claude/skills/verify-castle-defense/scripts/cdg.mjs launch
//        node tools/simprofile.mjs [seconds=15] [hero=warrior] [strategy=turtle]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [secs = '15', hero = 'warrior', strategy = 'turtle'] = process.argv.slice(2);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const st = JSON.parse(fs.readFileSync(path.join(REPO, '.verify/state.json'), 'utf8'));
const page = (await (await fetch(`http://127.0.0.1:${st.cdpPort}/json/list`)).json()).find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.result.value;

await ev(`(() => { const m = game.scene.getScene('MenuScene'); SimRunner.start(m, { heroes: ['${hero}'], difficulties: ['normal'], strategies: ['${strategy}'], seeds: 50, waveCap: 999 }); })()`);
await new Promise(r => setTimeout(r, 2000));   // warm up past the first wave
await send('Profiler.enable');
await send('Profiler.setSamplingInterval', { interval: 200 });
const simTime = `SimRunner.results.reduce((a, r) => a + r.time, 0) + (SimRunner.current ? SimRunner.current.stats.time : 0)`;
const t0 = await ev(simTime);
await send('Profiler.start');
await new Promise(r => setTimeout(r, Number(secs) * 1000));
const { result: { profile } } = await send('Profiler.stop');
const t1 = await ev(simTime);
const s = await ev(`(() => { const g = game.scene.getScene('GameScene'); return { runsDone: SimRunner.results.length, wave: g.waves.wave, enemies: g.enemies.length, allies: g.allies.length, projectiles: g.projectiles.length, buildings: g.buildings.length }; })()`);
await ev(`SimRunner.cancel()`);

const self = new Map(); let total = 0;
const byId = new Map(profile.nodes.map(n => [n.id, n]));
const dts = profile.timeDeltas; profile.samples.forEach((sid, i) => {
  const n = byId.get(sid), cf = n.callFrame, dt = dts[i] || 0;
  const key = `${cf.functionName || '(anon)'}  ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`;
  self.set(key, (self.get(key) || 0) + dt); total += dt;
});
console.log(`sim speed: ${((t1 - t0) / Number(secs)).toFixed(1)} game-s per real-s over ${secs}s · state at end`, s);
console.log('top self time:');
[...self].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, v]) => console.log(`${(v / total * 100).toFixed(1).padStart(5)}%  ${k}`));
ws.close();
