// Run the balance simulation split across several tabs of the headless Chrome that `cdg launch` started,
// then merge the runs into one report. Each tab runs every n-th job (SimRunner `shard`), so the results match
// a single-tab run of the same settings.
// Usage: node .claude/skills/verify-castle-defense/scripts/cdg.mjs launch
//        node tools/simpar.mjs [tabs=cores/2] ['{"heroes":["warrior"],"seeds":5,...}']
// Settings default to the full sweep: every hero and strategy, CONFIG.sim.defaultSeeds and defaultWaveCap.
// Writes .verify/artifacts/<report stem>.json and .md and prints the timing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tabs = Number(process.argv[2]) || Math.max(1, Math.floor(os.cpus().length / 2));
const overrides = JSON.parse(process.argv[3] || '{}');
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO, '.verify/artifacts');
const st = JSON.parse(fs.readFileSync(path.join(REPO, '.verify/state.json'), 'utf8'));
const cdp = `http://127.0.0.1:${st.cdpPort}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP websocket failed')); });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, (d) => d.error ? rej(new Error(d.error.message)) : res(d.result));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  return { send, close: () => ws.close() };
}

// Each shard gets its own window: a background tab is hidden, and Phaser stops its loop on hidden pages.
const browser = await connect((await (await fetch(`${cdp}/json/version`)).json()).webSocketDebuggerUrl);
async function openTab() {
  const { targetId } = await browser.send('Target.createTarget', { url: st.url, newWindow: true });
  const page = await connect(`ws://127.0.0.1:${st.cdpPort}/devtools/page/${targetId}`);
  const ev = async (expression) => {
    const r = await page.send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  for (const t0 = Date.now(); !(await ev(`typeof game !== 'undefined' && game.isBooted && game.scene.isActive('MenuScene')`).catch(() => false));) {
    if (Date.now() - t0 > 20000) throw new Error('a tab did not reach MenuScene within 20s');
    await sleep(200);
  }
  return { ev, close: async () => { page.close(); await browser.send('Target.closeTarget', { targetId }); } };
}

const pages = await Promise.all(Array.from({ length: tabs }, openTab));
const settings = Object.assign(await pages[0].ev(`({ heroes: Object.keys(CONFIG.heroes),
  strategies: Object.keys(CONFIG.sim.strategies), seeds: CONFIG.sim.defaultSeeds, waveCap: CONFIG.sim.defaultWaveCap })`), overrides);

const t0 = performance.now();
const shards = await Promise.all(pages.map(async (p, i) => {
  const shard = JSON.stringify(Object.assign({}, settings, { shard: { i, n: tabs } }));
  if (!(await p.ev(`SimRunner.start(game.scene.getScene('MenuScene'), ${shard})`))) return [];   // fewer jobs than tabs
  while (await p.ev('SimRunner.active')) await sleep(250);
  return p.ev('SimRunner.results');
}));
const realTime = (performance.now() - t0) / 1000;

const loadouts = await pages[0].ev(`(${JSON.stringify(settings.heroes)}).map(h => SimRunner.loadoutsOf(${JSON.stringify(settings)}, h))`);
const order = (r) => { const h = settings.heroes.indexOf(r.hero); return [h, loadouts[h].indexOf(r.loadout), settings.strategies.indexOf(r.strategy), r.seed]; };
const runs = shards.flat().sort((a, b) => {
  const x = order(a), y = order(b), k = x.findIndex((v, j) => v !== y[j]);
  return k < 0 ? 0 : x[k] - y[k];
});
const jobs = loadouts.reduce((a, l) => a + l.length, 0) * settings.strategies.length * settings.seeds;
const { rep, md } = await pages[0].ev(`(() => { const rep = SimReport.build(${JSON.stringify(runs)}, ${JSON.stringify(settings)},
  { cancelled: false, realTime: ${realTime}, planned: ${jobs}, tabs: ${tabs} }); return { rep, md: SimReport.markdown(rep) }; })()`);
await Promise.all(pages.map(p => p.close()));
browser.close();

fs.mkdirSync(OUT, { recursive: true });
const stem = path.join(OUT, 'balance-report-' + rep.generated.slice(0, 19).replace(/[:T]/g, '-'));
fs.writeFileSync(stem + '.json', JSON.stringify(rep, null, 2));
fs.writeFileSync(stem + '.md', md);
const gameS = runs.reduce((a, r) => a + r.time, 0);
console.log(JSON.stringify({ tabs, runs: runs.length, planned: jobs, realS: +realTime.toFixed(2), gameS, speed: Math.round(gameS / realTime),
  errors: runs.filter(r => r.error).length, report: stem + '.md' }));
