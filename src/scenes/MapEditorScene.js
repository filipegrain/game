// Map editor (Menu → Map Editor): paint terrain, move the Keep and spawns, add/move/remove lane towers and camps.
// Edits CONFIG.map in place, so a game started afterwards plays the edited map; Save rewrites src/map.js.

// src/map.js on disk: text format plus a File System Access API writer (Chrome/Edge). The chosen file handle is kept
// in IndexedDB so later saves go straight to it. Without the API (Firefox, Safari) Save downloads map.js instead.
const MapFile = {
  saved: null,       // text of the map as last loaded or saved: the "unsaved changes" baseline
  savedData: null,   // ...and the same map as data, for Revert

  serialize(m) {
    const pt = (o) => `{ x: ${o.x}, y: ${o.y} }`;
    return [
      '// Map data: written by the map editor (Menu → Map Editor); hand edits are fine too.',
      "// One char per 32px tile:  '.' grass   ':' dirt   '=' bridge   '~' river   '#' rock   'T' trees",
      '// Grass, dirt and bridges are walkable. Rocks, trees and the river block everything.',
      '// Marker positions are in tiles (centres); the Keep is its top-left tile and size.',
      'const MAP = {',
      '  grid: [',
      ...m.grid.map(r => `    '${r}',`),
      '  ],',
      `  keep: { x: ${m.keep.x}, y: ${m.keep.y}, w: ${m.keep.w}, h: ${m.keep.h} },`,
      '  spawns: [                       // enemy spawns, one per lane',
      ...m.spawns.map(s => `    { name: '${s.name}', x: ${s.x}, y: ${s.y} },`),
      '  ],',
      '  towers: [                       // allied lane towers, per lane ordered from the Keep outward. Creeps spawn at the first one.',
      ...m.towers.map(l => `    [${l.map(pt).join(', ')}],`),
      '  ],',
      '  camps: [                        // neutral camps',
      ...m.camps.map(c => `    { x: ${c.x}, y: ${c.y}, kind: '${c.kind}' },`),
      '  ],',
      '};',
      '',
    ].join('\n');
  },

  idb(mode, fn) {
    return new Promise((res, rej) => {
      const open = indexedDB.open('cd_map_editor', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('kv');
      open.onerror = () => rej(open.error);
      open.onsuccess = () => {
        const req = fn(open.result.transaction('kv', mode).objectStore('kv'));
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      };
    });
  },

  // → name of the file written, or null when it fell back to a download. `pick` asks for the file again.
  async save(text, pick) {
    if (!window.showSaveFilePicker) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      a.download = 'map.js';
      a.click();
      URL.revokeObjectURL(a.href);
      return null;
    }
    let h = pick ? null : await this.idb('readonly', s => s.get('mapFile'));
    if (!h) {
      h = await window.showSaveFilePicker({ suggestedName: 'map.js', types: [{ description: 'Game map (src/map.js)', accept: { 'text/javascript': ['.js'] } }] });
      await this.idb('readwrite', s => s.put(h, 'mapFile'));
    }
    if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('write permission denied');
    const w = await h.createWritable();
    await w.write(text);
    await w.close();
    return h.name;
  },
};

const EDITOR_TILES = [
  { ch: '.', label: 'Grass', color: 0x2d7f4e },
  { ch: ':', label: 'Dirt', color: 0x87543f },
  { ch: '=', label: 'Bridge', color: 0xb07e56 },
  { ch: '~', label: 'River', color: 0x4fa9b5 },
  { ch: '#', label: 'Rock', color: 0x5f6770 },
  { ch: 'T', label: 'Trees', color: 0x6fa83a },
];
const EDITOR_TOOLS = { move: 'Move', tower: 'Tower', camp: 'Camp' };
const EDITOR_HELP = {
  paint: 'Left-drag paints · right-click picks the tile · [ ] brush size',
  move: 'Drag the Keep, a spawn, a tower or a camp',
  tower: 'Click adds a tower to the selected lane (Tab) · drag moves · right-click removes',
  camp: 'Click adds a camp · drag moves · Shift+click switches weak/strong · right-click removes',
};
const LANE_COLORS = [0xffd23f, 0xff7ad9, 0x7ad7ff];
const BRUSHES = [1, 2, 3, 5, 8];

class MapEditorScene extends Phaser.Scene {
  constructor() { super('MapEditorScene'); }

  create() {
    const T = CONFIG.TILE, VW = CONFIG.VIEW_W, VH = CONFIG.VIEW_H;
    if (MapFile.saved == null) { MapFile.saved = MapFile.serialize(CONFIG.map); MapFile.savedData = this.snapshot(); }
    Object.assign(this, { tool: 'paint', tile: 1, brushIdx: 0, lane: 0, undo: [], drag: null, pan: null, spaceHeld: false, hover: null, labels: [] });

    // world layers on the main camera, HUD on a fixed camera above it
    this.uiCam = this.cameras.add(0, 0, VW, VH);
    this.tilesG = this.world(this.add.graphics());
    this.routeG = this.world(this.add.graphics());
    this.markG = this.world(this.add.graphics());
    this.cursorG = this.world(this.add.graphics());
    const cam = this.cameras.main;
    cam.setBackgroundColor('#0b0d12');
    cam.setBounds(-T * 4, -T * 4, CONFIG.WORLD_W + T * 8, CONFIG.WORLD_H + T * 8);
    cam.setZoom(Math.min(VW / CONFIG.WORLD_W, (VH - 80) / CONFIG.WORLD_H));
    cam.centerOn(CONFIG.WORLD_W / 2, CONFIG.WORLD_H / 2 - 8 / cam.zoom);

    this.buildToolbar();
    this.status = this.ui(this.add.text(8, VH - 22, '', { fontFamily: FONT, fontSize: '13px', color: '#cbd5e1' }));
    this.where = this.ui(this.add.text(VW - 8, VH - 22, '', { fontFamily: FONT, fontSize: '13px', color: '#9ca3af' }).setOrigin(1, 0));
    this.issuesText = this.ui(this.add.text(10, 52, '', { fontFamily: FONT, fontSize: '13px', color: '#ff8a8a', stroke: '#000', strokeThickness: 3, lineSpacing: 3 }));
    this.noticeText = this.ui(this.add.text(VW / 2, 60, '', { fontFamily: FONT, fontSize: '16px', color: '#ffd23f', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0));

    this.setupInput();
    this.drawTiles();
    this.revalidate();
  }

  world(obj) { this.uiCam.ignore(obj); return obj; }
  ui(obj) { this.cameras.main.ignore(obj); return obj; }
  get brush() { return BRUSHES[this.brushIdx]; }
  get laneName() { return CONFIG.map.spawns[this.lane].name; }

  // ---------------------------------------------------------------- toolbar
  buildToolbar() {
    this.ui(this.add.rectangle(0, 0, CONFIG.VIEW_W, 44, 0x111827).setOrigin(0));
    this.ui(this.add.rectangle(0, CONFIG.VIEW_H - 28, CONFIG.VIEW_W, 28, 0x111827).setOrigin(0));
    this.toolBtns = [];
    const btn = (x, w, label, fn, isOn) => {
      const r = this.ui(this.add.rectangle(x, 7, w, 30, 0x1f2937).setOrigin(0).setStrokeStyle(2, 0x4b5563).setInteractive({ useHandCursor: true }));
      const t = this.ui(this.add.text(x + w / 2, 22, label, { fontFamily: FONT, fontSize: '13px', color: '#e5e7eb', fontStyle: 'bold' }).setOrigin(0.5));
      r.on('pointerdown', (p) => { if (p.leftButtonDown()) fn(); });
      if (isOn) this.toolBtns.push({ r, isOn });
      return t;
    };
    EDITOR_TILES.forEach((d, i) => {
      btn(8 + i * 66, 62, `${i + 1} ${d.label}`, () => this.setTool('paint', i), () => this.tool === 'paint' && this.tile === i);
      this.ui(this.add.rectangle(12 + i * 66, 30, 54, 4, d.color).setOrigin(0));
    });
    Object.entries(EDITOR_TOOLS).forEach(([k, label], i) => btn(416 + i * 66, 62, `${i + 7} ${label}`, () => this.setTool(k), () => this.tool === k));
    this.brushText = btn(622, 92, '', () => this.setBrush(this.brushIdx + 1));
    this.laneText = btn(720, 110, '', () => this.cycleLane());
    btn(870, 70, 'Undo', () => this.undoLast());
    btn(946, 70, 'Revert', () => this.revert());
    btn(1022, 90, 'Save', () => this.save(false));
    btn(1118, 70, 'Menu', () => this.scene.start('MenuScene'));
  }

  setTool(tool, tile) {
    this.tool = tool;
    if (tile != null) this.tile = tile;
    this.refreshHud();
  }

  setBrush(i) { this.brushIdx = (i + BRUSHES.length) % BRUSHES.length; this.refreshHud(); }

  cycleLane() { this.lane = (this.lane + 1) % CONFIG.map.spawns.length; this.drawMarkers(); this.refreshHud(); }

  refreshHud() {
    for (const b of this.toolBtns) b.r.setStrokeStyle(2, b.isOn() ? 0xffd23f : 0x4b5563).setFillStyle(b.isOn() ? 0x374151 : 0x1f2937);
    this.brushText.setText(`Brush ${this.brush}×${this.brush}`);
    this.laneText.setText(`Lane: ${this.laneName}`).setColor('#' + LANE_COLORS[this.lane].toString(16).padStart(6, '0'));
    const dirty = MapFile.serialize(CONFIG.map) !== MapFile.saved;
    this.status.setText((dirty ? '● unsaved · ' : '') + EDITOR_HELP[this.tool] + ' · wheel zoom · middle/Space-drag or WASD pan · Ctrl+Z · Ctrl+S');
    const h = this.hover;
    this.where.setText(h && this.inMap(h.tx, h.ty) ? `tile ${h.tx}, ${h.ty}  ${EDITOR_TILES.find(d => d.ch === CONFIG.map.grid[h.ty][h.tx])?.label || ''}` : '');
  }

  notice(msg, bad) {
    this.noticeText.setText(msg).setColor(bad ? '#ff8a8a' : '#ffd23f').setAlpha(1);
    this.tweens.killTweensOf(this.noticeText);
    this.tweens.add({ targets: this.noticeText, alpha: 0, delay: 3500, duration: 600 });
  }

  // ---------------------------------------------------------------- input
  setupInput() {
    this.input.on('pointerdown', (p) => this.onDown(p));
    this.input.on('pointermove', (p) => this.onMove(p));
    this.input.on('pointerup', (p) => this.onUp(p));
    this.input.on('wheel', (p, objs, dx, dy) => {
      const cam = this.cameras.main, before = cam.getWorldPoint(p.x, p.y);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.85 : 1 / 0.85), 0.2, 2.5));
      cam.preRender();
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x; cam.scrollY += before.y - after.y;
    });
    // DOM listener: preventDefault on Ctrl+S/Z/Tab must run synchronously, and the save picker needs the key gesture
    const onKey = (e) => {
      if (e.type === 'keyup') { if (e.code === 'Space') this.spaceHeld = false; this.keys[e.code] = false; return; }
      this.keys[e.code] = true;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.code === 'KeyS') { e.preventDefault(); this.save(e.shiftKey); return; }
      if (ctrl && e.code === 'KeyZ') { e.preventDefault(); this.undoLast(); return; }
      if (ctrl) return;
      if (e.code === 'Space') { e.preventDefault(); this.spaceHeld = true; }
      else if (e.code === 'Tab') { e.preventDefault(); this.cycleLane(); }
      else if (e.code === 'BracketLeft') this.setBrush(this.brushIdx - 1);
      else if (e.code === 'BracketRight') this.setBrush(this.brushIdx + 1);
      else if (e.code === 'Escape') this.scene.start('MenuScene');
      else if (/^Digit[1-9]$/.test(e.code)) {
        const n = +e.code.slice(5) - 1;
        if (n < EDITOR_TILES.length) this.setTool('paint', n);
        else this.setTool(Object.keys(EDITOR_TOOLS)[n - EDITOR_TILES.length]);
      }
    };
    this.keys = {};
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    const unloadGuard = (e) => { if (MapFile.serialize(CONFIG.map) !== MapFile.saved) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', unloadGuard);
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('beforeunload', unloadGuard);
      if (this.textures.exists('map')) this.textures.remove('map');   // the sim reuses the last drawn map texture
    });
  }

  isOverUI(p) { return p.y < 44 || p.y > CONFIG.VIEW_H - 28; }

  pointerTile(p) {
    const w = this.cameras.main.getWorldPoint(p.x, p.y), T = CONFIG.TILE;
    return { fx: w.x / T, fy: w.y / T, tx: Math.floor(w.x / T), ty: Math.floor(w.y / T) };
  }

  inMap(tx, ty) { return tx >= 0 && ty >= 0 && tx < CONFIG.MAP_W && ty < CONFIG.MAP_H; }

  onDown(p) {
    if (this.isOverUI(p)) return;
    if (p.button === 1 || (p.button === 0 && this.spaceHeld)) {
      const cam = this.cameras.main;
      this.pan = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY };
      return;
    }
    const at = this.pointerTile(p), m = CONFIG.map;
    if (this.tool === 'paint') {
      if (p.button === 2) {
        const i = this.inMap(at.tx, at.ty) ? EDITOR_TILES.findIndex(d => d.ch === m.grid[at.ty][at.tx]) : -1;
        if (i >= 0) this.setTool('paint', i);
        return;
      }
      this.pushUndo();
      this.drag = { kind: 'paint' };
      this.paintAt(at);
      return;
    }
    const kinds = { move: ['keep', 'spawn', 'tower', 'camp'], tower: ['tower'], camp: ['camp'] }[this.tool];
    const hit = this.markerAt(at.fx, at.fy, kinds);
    if (p.button === 2) {
      if (hit && hit.kind === 'tower') {
        if (m.towers[hit.lane].length === 1) { this.notice(`Every lane needs a tower: ${m.spawns[hit.lane].name} has only this one`, true); return; }
        this.pushUndo();
        m.towers[hit.lane].splice(m.towers[hit.lane].indexOf(hit.obj), 1);
        this.revalidate();
      } else if (hit && hit.kind === 'camp') {
        this.pushUndo();
        m.camps.splice(m.camps.indexOf(hit.obj), 1);
        this.revalidate();
      }
      return;
    }
    if (p.button !== 0 || !this.inMap(at.tx, at.ty)) return;
    this.pushUndo();
    if (hit && hit.kind === 'camp' && p.event.shiftKey) {
      hit.obj.kind = hit.obj.kind === 'weak' ? 'strong' : 'weak';
      this.revalidate();
      return;
    }
    if (hit) {
      if (hit.kind === 'tower') this.lane = hit.lane;
      this.drag = { kind: 'marker', hit, grabX: at.fx, grabY: at.fy, moved: false };
      this.refreshHud();
      return;
    }
    const snap = (v) => Math.round(v * 2) / 2;
    if (this.tool === 'tower') m.towers[this.lane].push({ x: snap(at.fx), y: snap(at.fy) });
    else if (this.tool === 'camp') m.camps.push({ x: snap(at.fx), y: snap(at.fy), kind: 'weak' });
    else { this.undo.pop(); return; }
    this.revalidate();
  }

  onMove(p) {
    if (this.pan) {
      const cam = this.cameras.main;
      cam.scrollX = this.pan.sx - (p.x - this.pan.x) / cam.zoom;
      cam.scrollY = this.pan.sy - (p.y - this.pan.y) / cam.zoom;
      return;
    }
    const at = this.pointerTile(p);
    this.hover = at;
    if (this.drag && this.drag.kind === 'paint' && p.leftButtonDown()) this.paintAt(at);
    else if (this.drag && this.drag.kind === 'marker') this.moveMarker(this.drag.hit, at);
    this.drawCursor();
    this.refreshHud();
  }

  onUp() {
    this.pan = null;
    const d = this.drag;
    this.drag = null;
    if (d && d.kind === 'marker' && !d.moved) this.undo.pop();
    if (d) this.revalidate();
  }

  update(time, delta) {
    const cam = this.cameras.main, k = this.keys || {}, v = 900 / cam.zoom * delta / 1000;
    if (k.KeyA || k.ArrowLeft) cam.scrollX -= v;
    if (k.KeyD || k.ArrowRight) cam.scrollX += v;
    if (k.KeyW || k.ArrowUp) cam.scrollY -= v;
    if (k.KeyS || k.ArrowDown) cam.scrollY += v;
  }

  // ---------------------------------------------------------------- edits
  paintAt(at) {
    const m = CONFIG.map, n = this.brush, ch = EDITOR_TILES[this.tile].ch, x0 = at.tx - ((n - 1) >> 1), y0 = at.ty - ((n - 1) >> 1);
    let changed = false;
    for (let y = Math.max(0, y0); y < Math.min(CONFIG.MAP_H, y0 + n); y++) {
      const row = m.grid[y], a = Math.max(0, x0), b = Math.min(CONFIG.MAP_W, x0 + n);
      if (a >= b) continue;
      const next = row.slice(0, a) + ch.repeat(b - a) + row.slice(b);
      if (next !== row) { m.grid[y] = next; changed = true; }
    }
    if (changed) this.drawTiles();
  }

  markerAt(fx, fy, kinds) {
    const m = CONFIG.map, k = m.keep;
    if (kinds.includes('keep') && fx >= k.x && fx < k.x + k.w && fy >= k.y && fy < k.y + k.h) return { kind: 'keep', obj: k };
    let best = null, bestD = 1.5;
    const consider = (kind, obj, lane) => {
      const d = Math.hypot(obj.x - fx, obj.y - fy);
      if (d < bestD) { bestD = d; best = { kind, obj, lane }; }
    };
    if (kinds.includes('spawn')) m.spawns.forEach((s, i) => consider('spawn', s, i));
    if (kinds.includes('tower')) m.towers.forEach((l, i) => l.forEach(t => consider('tower', t, i)));
    if (kinds.includes('camp')) m.camps.forEach(c => consider('camp', c));
    return best;
  }

  moveMarker(hit, at) {
    const o = hit.obj, W = CONFIG.MAP_W, H = CONFIG.MAP_H;
    if (hit.kind === 'keep') {
      o.x = Phaser.Math.Clamp(Math.round(at.fx - o.w / 2), 0, W - o.w);
      o.y = Phaser.Math.Clamp(Math.round(at.fy - o.h / 2), 0, H - o.h);
    } else {
      o.x = Phaser.Math.Clamp(Math.round(at.fx * 2) / 2, 0.5, W - 0.5);
      o.y = Phaser.Math.Clamp(Math.round(at.fy * 2) / 2, 0.5, H - 0.5);
    }
    this.drag.moved = true;
    this.drawMarkers();
  }

  snapshot() {
    const m = CONFIG.map;
    return JSON.stringify({ grid: m.grid, keep: m.keep, spawns: m.spawns, towers: m.towers, camps: m.camps });
  }

  pushUndo() {
    this.undo.push(this.snapshot());
    if (this.undo.length > 200) this.undo.shift();
  }

  restore(data) {
    Object.assign(CONFIG.map, data);
    this.drawTiles();
    this.revalidate();
  }

  undoLast() {
    if (!this.undo.length) { this.notice('Nothing to undo'); return; }
    this.restore(JSON.parse(this.undo.pop()));
  }

  revert() {
    this.pushUndo();
    this.restore(JSON.parse(MapFile.savedData));
    this.notice('Reverted to the last saved map');
  }

  async save(pick) {
    if (this.saving) return;
    this.saving = true;
    const text = MapFile.serialize(CONFIG.map);
    if (!MapFile.saved || pick || !window.showSaveFilePicker) this.notice('Choose src/map.js in the game folder');
    try {
      const name = await MapFile.save(text, pick);
      MapFile.saved = text;
      MapFile.savedData = this.snapshot();
      const warn = this.issues.length ? ` (with ${this.issues.length} problem${this.issues.length > 1 ? 's' : ''})` : '';
      if (!name) this.notice('Downloaded map.js: replace src/map.js with it' + warn, !!warn);
      else if (name !== 'map.js') this.notice(`Saved to ${name}, but the game loads src/map.js: Ctrl+Shift+S picks the file again`, true);
      else this.notice('Saved src/map.js' + warn, !!warn);
    } catch (e) {
      this.notice(e.name === 'AbortError' ? 'Save cancelled' : 'Save failed: ' + e.message, true);
    }
    this.saving = false;
    this.refreshHud();
  }

  // ---------------------------------------------------------------- validation: the game's own Pathing on the edited map
  revalidate() {
    const m = CONFIG.map, p = new Pathing(null), at = (o) => p.idx(Math.floor(o.x), Math.floor(o.y));
    const keepDist = (o) => p.isWalkable(Math.floor(o.x), Math.floor(o.y)) ? p.dist[at(o)] : Infinity;
    // towers are ordered from the Keep outward: the first spawns creeps, the last is the lane's bridge waypoint
    const before = JSON.stringify(m.towers);
    for (const l of m.towers) l.sort((a, b) => keepDist(a) - keepDist(b));
    if (JSON.stringify(m.towers) !== before) { p.buildMap(); p.computeFlowField(); }

    const issues = [], ground = (o) => p.isWalkable(Math.floor(o.x), Math.floor(o.y));
    const place = (o, name) => {
      if (!ground(o)) issues.push(`${name} sits on blocked ground`);
      else if (!Number.isFinite(p.dist[at(o)])) issues.push(`${name} has no route to the Keep`);
    };
    if (!p.keepGoals.length) issues.push('The Keep has no walkable tile next to it');
    m.spawns.forEach((s, i) => {
      place(s, `${s.name} spawn`);
      m.towers[i].forEach((t, j) => place(t, `${s.name} tower ${j + 1}`));
      const bridge = m.towers[i][m.towers[i].length - 1];
      if (ground(s) && ground(bridge) && !Number.isFinite(p.spawnDist[i][at(bridge)])) issues.push(`${s.name} spawn cannot reach its outer tower`);
    });
    m.camps.forEach((c, i) => place(c, `Camp ${i + 1}`));
    this.issues = issues;
    this.issuesText.setText(issues.length ? ['Problems (the game may break):', ...issues.slice(0, 8), issues.length > 8 ? `…and ${issues.length - 8} more` : ''].join('\n') : '');
    this.routes = m.spawns.map((s, i) => this.route(p, s, m.towers[i][m.towers[i].length - 1], i));
    this.drawMarkers();
    this.refreshHud();
  }

  // Tile path an enemy of lane i takes: down bridgeDist[i] to the lane's outer tower, then down dist to the Keep.
  route(p, spawn, bridge, i) {
    const pts = [];
    let x = Math.floor(spawn.x), y = Math.floor(spawn.y);
    for (const field of [p.bridgeDist[i], p.dist]) {
      for (let guard = 0; guard < 4000; guard++) {
        pts.push([x, y]);
        const cur = field[p.idx(x, y)];
        if (!Number.isFinite(cur) || cur === 0) break;
        let bx = -1, by = -1, bd = cur;
        for (const [dx, dy] of DIRS8) {
          const nx = x + dx, ny = y + dy;
          if (!p.isWalkable(nx, ny)) continue;
          const d = field[p.idx(nx, ny)];
          if (d < bd) { bd = d; bx = nx; by = ny; }
        }
        if (bx < 0) break;
        x = bx; y = by;
      }
    }
    return pts;
  }

  // ---------------------------------------------------------------- drawing
  drawTiles() {
    const g = this.tilesG, T = CONFIG.TILE, colors = Object.fromEntries(EDITOR_TILES.map(d => [d.ch, d.color]));
    g.clear();
    CONFIG.map.grid.forEach((row, y) => {
      for (let x = 0; x < row.length;) {   // one rect per run of equal tiles
        let e = x + 1;
        while (e < row.length && row[e] === row[x]) e++;
        g.fillStyle(colors[row[x]] ?? 0x5f6770, 1).fillRect(x * T, y * T, (e - x) * T, T);
        x = e;
      }
    });
    g.lineStyle(1, 0x000000, 0.12);
    for (let x = 0; x <= CONFIG.MAP_W; x += 4) g.lineBetween(x * T, 0, x * T, CONFIG.WORLD_H);
    for (let y = 0; y <= CONFIG.MAP_H; y += 4) g.lineBetween(0, y * T, CONFIG.WORLD_W, y * T);
  }

  drawMarkers() {
    const g = this.markG, rg = this.routeG, T = CONFIG.TILE, m = CONFIG.map, k = m.keep;
    g.clear(); rg.clear();
    this.labels.forEach(t => t.destroy());
    this.labels = [];
    const label = (x, y, s, color, size, stroke = 5) => this.labels.push(this.world(this.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', color, fontStyle: 'bold', stroke: '#000', strokeThickness: stroke }).setOrigin(0.5)));

    (this.routes || []).forEach((pts, i) => {
      if (pts.length < 2) return;
      rg.lineStyle(10, LANE_COLORS[i], i === this.lane ? 0.75 : 0.35).beginPath();
      pts.forEach(([x, y], j) => (j ? rg.lineTo : rg.moveTo).call(rg, x * T + T / 2, y * T + T / 2));
      rg.strokePath();
    });
    for (const c of m.camps) {
      g.lineStyle(4, 0x9fe9ff, 0.5).strokeCircle(c.x * T, c.y * T, 70);
      g.fillStyle(c.kind === 'strong' ? 0x3f8f86 : 0x5fb3a8, 1).fillCircle(c.x * T, c.y * T, c.kind === 'strong' ? 22 : 15);
      g.lineStyle(3, 0x000000, 0.6).strokeCircle(c.x * T, c.y * T, c.kind === 'strong' ? 22 : 15);
    }
    g.fillStyle(0x1f1833, 1).fillRect(k.x * T, k.y * T, k.w * T, k.h * T);
    g.lineStyle(4, 0xffd23f, 1).strokeRect(k.x * T, k.y * T, k.w * T, k.h * T);
    label((k.x + k.w / 2) * T, (k.y + k.h / 2) * T, 'KEEP', '#ffd23f', 28);
    m.spawns.forEach((s, i) => {
      g.fillStyle(0x2a0a0a, 0.85).fillCircle(s.x * T, s.y * T, 40);
      g.lineStyle(5, LANE_COLORS[i], 1).strokeCircle(s.x * T, s.y * T, 40);
      label(s.x * T, s.y * T, s.name, '#' + LANE_COLORS[i].toString(16).padStart(6, '0'), 20);
    });
    m.towers.forEach((l, i) => l.forEach((t, j) => {
      const a = i === this.lane ? 1 : 0.55;
      g.fillStyle(LANE_COLORS[i], a).fillCircle(t.x * T, t.y * T, 26);
      g.lineStyle(4, 0x000000, 0.8 * a).strokeCircle(t.x * T, t.y * T, 26);
      label(t.x * T, t.y * T, String(j + 1), '#000000', 22, 0);
    }));
  }

  drawCursor() {
    const g = this.cursorG, T = CONFIG.TILE, h = this.hover;
    g.clear();
    if (!h || this.tool !== 'paint' || this.pan) return;
    const n = this.brush, x0 = h.tx - ((n - 1) >> 1), y0 = h.ty - ((n - 1) >> 1);
    g.fillStyle(EDITOR_TILES[this.tile].color, 0.45).fillRect(x0 * T, y0 * T, n * T, n * T);
    g.lineStyle(3, 0xffffff, 0.9).strokeRect(x0 * T, y0 * T, n * T, n * T);
  }
}
