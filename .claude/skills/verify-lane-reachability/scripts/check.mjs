#!/usr/bin/env node
// Exhaustive check of the reachability promises on the REAL game code (no hand model).
// Loads src/config.js, src/systems/Pathing.js, src/entities/{Building,Tower,Keep}.js and src/systems/BuildSystem.js
// into a Node vm the way index.html's <script> tags would, with rendering/sound stubbed out.
//
//   node check.mjs              run the properties against the working tree
//   node check.mjs --self-test  also run each mutant and require that the check FAILS on it
//
// Exit code 0 = all properties hold (and, with --self-test, every mutant was caught).

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const FILES = ['src/config.js', 'src/systems/Pathing.js', 'src/entities/Building.js', 'src/entities/Tower.js', 'src/entities/Keep.js', 'src/systems/BuildSystem.js'];

// Broken variants used to prove the check can fail. Each is a literal text edit on one real source file.
const MUTANTS = {
  'build-allows-trees-and-rocks': { file: 'src/systems/BuildSystem.js', find: 'else if (!p.isBuildable(x, y)) terrain = true;', replace: '', expect: 'P3' },
  'route-rule-skipped': { file: 'src/systems/BuildSystem.js', find: 'if (this.scene.pathing.wouldDisconnect(tx, ty, CONFIG.buildings.footprint))', replace: 'if (false)', expect: 'P4' },
  'spawn-inside-rock': { file: 'src/config.js', find: "{ name: 'MID', x: 114.5, y: 32 }", replace: "{ name: 'MID', x: 119.5, y: 67 }", expect: 'P1' },
  'flow-field-hole': { file: 'src/systems/Pathing.js', find: 'if (nd < field[ni]) { field[ni] = nd; heap.push(ni, nd); }', replace: 'if (nd < field[ni] && !(nx === 60 && ny === 60)) { field[ni] = nd; heap.push(ni, nd); }', expect: 'P1' },
  'bridge-waypoint-skipped': { file: 'src/systems/Pathing.js', find: 'if (unit.viaBridge) {', replace: 'if (false) {', expect: 'P2' },
};

function load(mutant) {
  // Anything the code under test touches for drawing or sound is a no-op that returns itself.
  const noop = new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : noop, apply: () => noop });
  const ctx = vm.createContext({ Phaser: { Math: { Clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } }, Feel: noop, Sfx: noop, console, Math });
  for (const f of FILES) {
    let src = fs.readFileSync(path.join(REPO, f), 'utf8');
    if (mutant && mutant.file === f) {
      if (!src.includes(mutant.find)) throw new Error(`mutant text not found in ${f}; update MUTANTS in check.mjs to match the code`);
      src = src.replace(mutant.find, mutant.replace);
    }
    vm.runInContext(src, ctx, { filename: f });
  }
  return vm.runInContext('({ CONFIG, TILE_T, Pathing, Building, Tower, Keep, BuildSystem })', ctx);
}

function run(mutant) {
  const { CONFIG, TILE_T, Pathing, Tower, Keep, BuildSystem } = load(mutant);
  const scene = { buildings: [], towers: [] };
  const chain = new Proxy(function () {}, { get: () => chain, apply: () => chain });
  scene.add = chain;
  scene.economy = { canAfford: () => true };        // gold never limits the domain
  scene.pathing = new Pathing(scene);
  scene.keep = new Keep(scene);
  CONFIG.map.towers.forEach((lane, li) => lane.forEach((def, i) => scene.towers.push(new Tower(scene, li, i, def))));
  const build = new BuildSystem(scene);
  const p = scene.pathing, W = p.W, H = p.H, T = CONFIG.TILE, m = CONFIG.map;
  const fails = [];
  const fail = (prop, msg) => { if (fails.filter(f => f.prop === prop).length < 5) fails.push({ prop, msg }); else if (!fails.some(f => f.prop === prop && f.more)) fails.push({ prop, more: true, msg: '(more counterexamples omitted)' }); };

  // P1: every spawn, tower and camp sits on walkable ground with a route to the Keep, and from every tile with a
  // route, following the enemy flow field (Pathing.flowNext) strictly descends to a goal tile next to the Keep.
  const marks = [...m.spawns.map(s => ['spawn ' + s.name, s]), ...m.towers.flat().map((t, i) => ['tower ' + i, t]), ...m.camps.map((c, i) => ['camp ' + i, c])];
  for (const [name, s] of marks) {
    const tx = Math.floor(s.x), ty = Math.floor(s.y);
    if (!p.isWalkable(tx, ty)) fail('P1', `${name} at tile (${tx},${ty}) is not walkable`);
    else if (!Number.isFinite(p.dist[p.idx(tx, ty)])) fail('P1', `${name} at tile (${tx},${ty}) has no route to the Keep`);
  }
  // every tile 4-connected to the Keep must have a route (no holes in the field)
  const seen = new Uint8Array(W * H), queue = [...p.keepGoals];
  queue.forEach(i => { seen[i] = 1; });
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!p.isWalkable(nx, ny) || seen[p.idx(nx, ny)]) continue;
      seen[p.idx(nx, ny)] = 1; queue.push(p.idx(nx, ny));
      if (!Number.isFinite(p.dist[p.idx(nx, ny)])) fail('P1', `tile (${nx},${ny}) is connected to the Keep but has no flow route`);
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!p.isWalkable(x, y) || !Number.isFinite(p.dist[p.idx(x, y)])) continue;
    let cx = x, cy = y, steps = 0;
    for (;;) {
      const nx = p.flowNext(cx * T + 16, cy * T + 16);
      if (!nx) break;
      const before = p.dist[p.idx(cx, cy)], after = p.dist[p.idx(nx.tx, nx.ty)];
      if (!(after < before)) { fail('P1', `enemy at (${x},${y}) gets stuck at (${cx},${cy}): next (${nx.tx},${nx.ty}) is not closer (${before} -> ${after})`); break; }
      cx = nx.tx; cy = nx.ty;
      if (++steps > W * H) { fail('P1', `enemy at (${x},${y}) loops forever`); break; }
    }
  }

  // P2: lane routes. An enemy from spawn i (Pathing.laneNext via the lane's bridge) reaches the Keep and passes
  // every tower of lane i; a creep from lane i's first tower reaches spawn i the same way in reverse.
  const walk = (x, y, lane, field) => {
    const u = { x, y, lane, viaBridge: true }, near = new Set();
    for (let steps = 0; steps < W * H; steps++) {
      for (const t of scene.towers) if (t.lane === lane && Math.hypot(t.x - u.x, t.y - u.y) < 200) near.add(t.order);
      const n = p.laneNext(u, field);
      if (!n) return { done: field[p.idx(p.tileOf(u.x), p.tileOf(u.y))] <= 3 || field[p.idx(p.tileOf(u.x), p.tileOf(u.y))] === 0, near };
      u.x = n.tx * T + 16; u.y = n.ty * T + 16;
      if (field === p.spawnDist[lane] && field[p.idx(n.tx, n.ty)] <= 3) return { done: true, near };
    }
    return { done: false, near };
  };
  m.spawns.forEach((s, lane) => {
    const n = m.towers[lane].length;
    const e = walk(s.x * T, s.y * T, lane, p.dist);
    if (!e.done) fail('P2', `enemies from ${s.name} never reach the Keep`);
    else if (e.near.size !== n) fail('P2', `enemies from ${s.name} pass only ${e.near.size}/${n} of their lane's towers`);
    const t0 = scene.towers.find(t => t.lane === lane && t.order === 0);
    const c = walk(t0.x, t0.y, lane, p.spawnDist[lane]);
    if (!c.done) fail('P2', `creeps of lane ${s.name} never reach their spawn`);
    else if (c.near.size !== n) fail('P2', `creeps of lane ${s.name} pass only ${c.near.size}/${n} of their lane's towers`);
  });

  // P3: at max Keep tier, for every building type and tile, BuildSystem.checkPlace accepts only grass/dirt
  // footprints, and an accepted footprint leaves every spawn with a route to the Keep.
  while (scene.keep.nextTierDef) scene.keep.upgrade();
  const fp = CONFIG.buildings.footprint;
  const types = Object.keys(CONFIG.buildings).filter(k => CONFIG.buildings[k] && CONFIG.buildings[k].cost);
  let accepted = 0;
  for (let ty = -fp; ty < H + fp; ty++) for (let tx = -fp; tx < W + fp; tx++) {
    const ok = types.filter(t => build.checkPlace(t, tx, ty).ok);
    if (!ok.length) continue;
    accepted++;
    let terrain = true;
    p.forEachFootprint(tx, ty, fp, (x, y) => { if (!p.isBuildable(x, y)) terrain = false; });
    if (!terrain) { fail('P3', `${ok[0]} accepted at (${tx},${ty}) on rock, trees, water or a bridge`); continue; }
    const idx = [];
    p.forEachFootprint(tx, ty, fp, (x, y) => { idx.push(p.idx(x, y)); p.building[p.idx(x, y)] = true; });
    p.fillField(p.dist, p.keepGoals);
    for (const [i, si] of p.spawnTiles.entries()) if (!Number.isFinite(p.dist[si])) fail('P3', `${ok[0]} accepted at (${tx},${ty}) cuts ${m.spawns[i].name} off from the Keep`);
    for (const i of idx) p.building[i] = null;
  }
  p.computeFlowField();

  // P4: an adversarial builder that keeps placing on the current enemy route (BuildSystem.checkPlace, then
  // Pathing.occupyBuilding as the game does) never walls a spawn off from the Keep, however many buildings pile up.
  let placed = 0;
  for (let round = 0; round < 400; round++) {
    let spot = null;
    for (const [lane, s] of m.spawns.entries()) {
      let x = s.x * T, y = s.y * T;
      for (let steps = 0; steps < W * H && !spot; steps++) {
        const n = p.flowNext(x, y);
        if (!n) break;
        for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) if (!spot && build.checkPlace('arrow', n.tx + ox, n.ty + oy).ok) spot = { tx: n.tx + ox, ty: n.ty + oy };
        x = n.tx * T + 16; y = n.ty * T + 16;
      }
      if (spot) break;
    }
    if (!spot) break;                                  // nothing on any route can be built on any more
    const b = { tx: spot.tx, ty: spot.ty, fp };
    scene.buildings.push(b); p.occupyBuilding(b); placed++;
    const cut = p.spawnTiles.findIndex(si => !Number.isFinite(p.dist[si]));
    if (cut >= 0) { fail('P4', `after ${placed} buildings on the route, the one at (${spot.tx},${spot.ty}) cuts ${m.spawns[cut].name} off from the Keep`); break; }
  }
  return { fails, stats: { routeBuildings: placed, walkableTiles: p.tiles.filter((t, i) => p.isGround(i % W, (i / W) | 0)).length, acceptedPlacements: accepted } };
}

const report = (name, r) => {
  const props = ['P1', 'P2', 'P3', 'P4'];
  console.log(`${name}: ${JSON.stringify(r.stats)}`);
  for (const pr of props) {
    const fs_ = r.fails.filter(f => f.prop === pr);
    console.log(`  ${pr} ${fs_.length ? 'FAIL' : 'ok'}`);
    for (const f of fs_) console.log(`     - ${f.msg}`);
  }
};

const base = run(null);
report('working tree', base);
let exit = base.fails.length ? 1 : 0;
if (process.argv.includes('--self-test')) {
  for (const [name, mu] of Object.entries(MUTANTS)) {
    const r = run(mu);
    const caught = r.fails.some(f => f.prop === mu.expect);
    console.log(`mutant ${name}: ${caught ? 'caught by ' + mu.expect : 'NOT CAUGHT (expected ' + mu.expect + ')'}`);
    if (!caught) exit = 1;
  }
}
process.exit(exit);
