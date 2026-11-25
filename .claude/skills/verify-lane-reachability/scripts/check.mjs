#!/usr/bin/env node
// Exhaustive check of the lane-reachability promise on the REAL game code (no hand model).
// Loads src/config.js, src/systems/Pathing.js, src/entities/{Building,Keep}.js and src/systems/BuildSystem.js
// into a Node vm the way index.html's <script> tags would, with rendering/sound stubbed out.
//
//   node check.mjs              run the three properties against the working tree
//   node check.mjs --self-test  also run each mutant and require that the check FAILS on it
//
// Exit code 0 = all properties hold (and, with --self-test, every mutant was caught).

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const FILES = ['src/config.js', 'src/systems/Pathing.js', 'src/entities/Building.js', 'src/entities/Keep.js', 'src/systems/BuildSystem.js'];

// Broken variants used to prove the check can fail. Each is a literal text edit on one real source file.
const MUTANTS = {
  'build-allows-lane-tiles': { file: 'src/systems/BuildSystem.js', find: "if (blocked) return { ok: false, reason: 'Buildings go next to lanes, not on them' };", replace: '', expect: 'P3' },
  'building-footprint-bigger-than-checked': { file: 'src/entities/Building.js', find: 'const fp = CONFIG.buildings.footprint;', replace: 'const fp = CONFIG.buildings.footprint + 1;', expect: 'P3' },
  'plaza-detached-from-lanes': { file: 'src/config.js', find: '{ x: 7, y: 6, w: 21, h: 33 }', replace: '{ x: 7, y: 6, w: 20, h: 33 }', expect: 'P1' },
  'spawn-past-the-map-edge': { file: 'src/config.js', find: "spawn: { x: 94.5, y: 22.5 }", replace: "spawn: { x: 96.5, y: 22.5 }", expect: 'P2' },
  'diagonal-corner-cut-loop': { file: 'src/systems/Pathing.js', find: 'if (nd < dist[ni]) { dist[ni] = nd; heap.push(ni, nd); }', replace: 'if (nd < dist[ni] && !(nx === 60 && ny === 8)) { dist[ni] = nd; heap.push(ni, nd); }', expect: 'P1' },
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
  return vm.runInContext('({ CONFIG, TILE_T, Pathing, Building, Keep, BuildSystem })', ctx);
}

function run(mutant) {
  const { CONFIG, TILE_T, Pathing, Building, Keep, BuildSystem } = load(mutant);
  const scene = { buildings: [] };
  const chain = new Proxy(function () {}, { get: () => chain, apply: () => chain });
  scene.add = chain;
  scene.economy = { canAfford: () => true };        // gold never limits the domain: every placement check() allows except for cost
  scene.pathing = new Pathing(scene);
  scene.keep = new Keep(scene);
  const build = new BuildSystem(scene);
  const p = scene.pathing, W = p.W, H = p.H;
  const fails = [];
  const fail = (prop, msg) => { if (fails.filter(f => f.prop === prop).length < 5) fails.push({ prop, msg }); else if (!fails.some(f => f.prop === prop && f.more)) fails.push({ prop, more: true, msg: '(more counterexamples omitted)' }); };
  const lane = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p.isLane(x, y)) lane.push([x, y]);
  const base = Float32Array.from(p.dist);

  // P1: from every lane tile, following the enemy flow field (Pathing.flowNext) reaches the Keep.
  for (const [x, y] of lane) {
    const d0 = p.dist[p.idx(x, y)];
    if (!Number.isFinite(d0)) { fail('P1', `lane tile (${x},${y}) has no route to the Keep (flow distance Infinity)`); continue; }
    let cx = x, cy = y, steps = 0;
    for (;;) {
      const nx = p.flowNext(cx * 32 + 16, cy * 32 + 16);
      if (!nx) break;                                          // at a goal tile next to the Keep
      const before = p.dist[p.idx(cx, cy)], after = p.dist[p.idx(nx.tx, nx.ty)];
      if (!(after < before)) { fail('P1', `enemy at lane tile (${x},${y}) gets stuck at (${cx},${cy}): next tile (${nx.tx},${nx.ty}) is not closer (${before} -> ${after})`); break; }
      cx = nx.tx; cy = nx.ty;
      if (++steps > W * H) { fail('P1', `enemy at (${x},${y}) loops forever`); break; }
    }
  }

  // P2: every tile WaveManager.update can spawn an enemy on is a lane tile with a route.
  // Spawn position (WaveManager.js update): x = spawn.x*T + [0,20), y = clamp(spawn.y*T ± (h-1)*T/2, laneDef.y*T+14, (laneDef.y+laneDef.h)*T-14).
  const T = CONFIG.TILE;
  CONFIG.map.lanes.forEach((L, li) => {
    const laneDef = CONFIG.map.paths[li === 0 ? 0 : li === 1 ? 1 : 2];
    const sx = L.spawn.x * T, sy = L.spawn.y * T, half = (laneDef.h - 1) * T / 2;
    const clamp = (v) => Math.max(laneDef.y * T + 14, Math.min((laneDef.y + laneDef.h) * T - 14, v));
    const y0 = clamp(sy - half), y1 = clamp(sy + half);
    for (let ty = Math.floor(y0 / T); ty <= Math.floor(y1 / T); ty++)
      for (let tx = Math.floor(sx / T); tx <= Math.floor((sx + 20) / T); tx++) {
        if (!p.isLane(tx, ty)) fail('P2', `${L.name} spawn can place an enemy on non-lane tile (${tx},${ty})`);
        else if (!Number.isFinite(p.dist[p.idx(tx, ty)])) fail('P2', `${L.name} spawn tile (${tx},${ty}) has no route to the Keep`);
      }
  });

  // P3: no placement the build check allows, at any Keep tier, for any building type, changes the enemy flow field
  // or makes a lane tile unwalkable. check() only adds rejections as buildings accumulate (occupied), and a building
  // only affects pathing through the tiles it occupies, so single placements on the empty map cover every build order.
  const types = Object.keys(CONFIG.buildings).filter(k => CONFIG.buildings[k] && typeof CONFIG.buildings[k] === 'object' && 'cost' in CONFIG.buildings[k]);
  const fpMax = CONFIG.buildings.footprint + 2;
  let legal = 0;
  const changed = new Map();   // occupied-tile set -> first flow-field difference, or null
  for (let tier = 1; tier <= CONFIG.keep.tiers.length; tier++) {
    scene.keep.tier = tier;
    for (const type of types) {
      for (let ty = -fpMax; ty < H + fpMax; ty++) for (let tx = -fpMax; tx < W + fpMax; tx++) {
        if (!build.check(type, tx, ty).ok) continue;
        legal++;
        const b = new Building(scene, type, tx, ty);
        p.forEachFootprint(b.tx, b.ty, b.fp, (x, y) => {
          if (p.isLane(x, y)) fail('P3', `tier ${tier} ${type} at (${tx},${ty}) occupies lane tile (${x},${y})`);
        });
        // the flow field reads buildings only through the set of occupied tiles, so equal sets give equal fields
        const key = [];
        p.forEachFootprint(b.tx, b.ty, b.fp, (x, y) => key.push(x + ',' + y));
        const k = key.join(' ');
        if (!changed.has(k)) {
          p.occupyBuilding(b);
          p.computeFlowField();
          let diff = null;
          for (let i = 0; i < base.length; i++) if (p.dist[i] !== base[i]) { diff = `tile (${i % W},${(i / W) | 0}): ${base[i]} -> ${p.dist[i]}`; break; }
          changed.set(k, diff);
          p.freeBuilding(b);
        }
        if (changed.get(k)) fail('P3', `tier ${tier} ${type} at (${tx},${ty}) changes the enemy route at ${changed.get(k)}`);
      }
    }
  }
  p.computeFlowField();
  if (legal === 0) fail('P3', 'vacuous: the build check allowed no placement at all, so P3 proved nothing');
  return { fails, laneTiles: lane.length, legalPlacements: legal, tiers: CONFIG.keep.tiers.length, types };
}

function report(r) {
  for (const prop of ['P1', 'P2', 'P3']) {
    const f = r.fails.filter(x => x.prop === prop);
    console.log(`${f.length ? 'FAIL' : 'ok  '} ${prop}`);
    for (const x of f) console.log('       ' + x.msg);
  }
}

const selfTest = process.argv.includes('--self-test');
const r = run(null);
console.log(`lane-reachability @ ${REPO}`);
console.log(`domain: ${r.laneTiles} lane tiles, ${r.tiers} Keep tiers x ${r.types.length} building types (${r.types.join(', ')}), ${r.legalPlacements} legal placements`);
console.log('P1 every lane tile reaches the Keep by following the flow field');
console.log('P2 every tile an enemy can spawn on is a lane tile with a route');
console.log('P3 no legal building placement changes the enemy route');
report(r);
let ok = r.fails.length === 0;
if (selfTest) {
  console.log('\nself-test (each mutant must make its property FAIL):');
  for (const [name, m] of Object.entries(MUTANTS)) {
    let caught, detail;
    try { const mr = run(m); caught = mr.fails.some(f => f.prop === m.expect); detail = (mr.fails.find(f => f.prop === m.expect) || {}).msg; }
    catch (e) { caught = false; detail = 'error: ' + e.message; }
    console.log(`${caught ? 'caught' : 'MISSED'} ${name} -> ${m.expect}${detail ? ': ' + detail : ''}`);
    if (!caught) ok = false;
  }
}
process.exit(ok ? 0 : 1);
