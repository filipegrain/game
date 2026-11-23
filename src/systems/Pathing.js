// Tile map, collision, flow field (enemies → Keep) and A* (hero/allies).

const TILE_T = { TERRAIN: 0, PATH: 1, CONNECTOR: 2, KEEP: 3 };

class MinHeap {
  constructor() { this.items = []; this.prio = []; }
  get size() { return this.items.length; }
  push(item, p) {
    const it = this.items, pr = this.prio;
    it.push(item); pr.push(p);
    let i = it.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pr[parent] <= pr[i]) break;
      [it[parent], it[i]] = [it[i], it[parent]];
      [pr[parent], pr[i]] = [pr[i], pr[parent]];
      i = parent;
    }
  }
  pop() {
    const it = this.items, pr = this.prio;
    const top = it[0];
    const lastI = it.pop(), lastP = pr.pop();
    if (it.length > 0) {
      it[0] = lastI; pr[0] = lastP;
      let i = 0;
      const n = it.length;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < n && pr[l] < pr[m]) m = l;
        if (r < n && pr[r] < pr[m]) m = r;
        if (m === i) break;
        [it[m], it[i]] = [it[i], it[m]];
        [pr[m], pr[i]] = [pr[i], pr[m]];
        i = m;
      }
    }
    return top;
  }
}

const DIRS8 = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

class Pathing {
  constructor(scene) {
    this.scene = scene;
    this.W = CONFIG.MAP_W;
    this.H = CONFIG.MAP_H;
    this.T = CONFIG.TILE;
    const n = this.W * this.H;
    this.tiles = new Uint8Array(n);
    this.building = new Array(n).fill(null);
    this.dist = new Float32Array(n);
    this.gScore = new Float32Array(n);
    this.cameFrom = new Int32Array(n);
    this.closed = new Uint8Array(n);
    this.buildMap();
    this.computeFlowField();
  }

  buildMap() {
    const m = CONFIG.map;
    const fill = (r, t) => {
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++)
          if (this.inBounds(x, y)) this.tiles[this.idx(x, y)] = t;
    };
    m.paths.forEach(r => fill(r, TILE_T.PATH));
    m.connectors.forEach(r => fill(r, TILE_T.CONNECTOR));
    fill(m.keep, TILE_T.KEEP);
  }

  idx(x, y) { return y * this.W + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  tileOf(px) { return Math.floor(px / this.T); }
  tileType(x, y) { return this.inBounds(x, y) ? this.tiles[this.idx(x, y)] : TILE_T.TERRAIN; }
  isLane(x, y) { const t = this.tileType(x, y); return t === TILE_T.PATH || t === TILE_T.CONNECTOR; }
  buildingAt(x, y) { return this.inBounds(x, y) ? this.building[this.idx(x, y)] : null; }
  isWalkable(x, y) { return this.isLane(x, y) && !this.building[this.idx(x, y)]; }
  blockedTile(x, y) { return !this.isWalkable(x, y); }

  laneOfY(py) {
    const ty = py / this.T;
    if (ty < CONFIG.map.laneSplitTop) return 0;
    if (ty >= CONFIG.map.laneSplitBot) return 2;
    return 1;
  }

  // ---------------------------------------------------------- collision
  circleBlocked(x, y, r) {
    const T = this.T;
    const x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r) / T);
    const y0 = Math.floor((y - r) / T), y1 = Math.floor((y + r) / T);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.blockedTile(tx, ty)) continue;
        const cx = Math.max(tx * T, Math.min(x, tx * T + T));
        const cy = Math.max(ty * T, Math.min(y, ty * T + T));
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy < r * r) return true;
      }
    }
    return false;
  }

  // Moves a unit with axis-separated sliding. Returns true if it bumped into something.
  moveUnit(u, dx, dy) {
    const r = u.radius * 0.75;
    if (dx === 0 && dy === 0) return false;
    if (this.circleBlocked(u.x, u.y, r)) {
      // Stuck inside something: let the unit walk out.
      u.x = Phaser.Math.Clamp(u.x + dx, r, CONFIG.WORLD_W - r);
      u.y = Phaser.Math.Clamp(u.y + dy, r, CONFIG.WORLD_H - r);
      return false;
    }
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8));
    const sx = dx / steps, sy = dy / steps;
    let bumped = false;
    for (let i = 0; i < steps; i++) {
      let movedX = false, movedY = false;
      if (sx !== 0) {
        if (!this.circleBlocked(u.x + sx, u.y, r)) { u.x += sx; movedX = true; } else bumped = true;
      }
      if (sy !== 0) {
        if (!this.circleBlocked(u.x, u.y + sy, r)) { u.y += sy; movedY = true; } else bumped = true;
      }
      // Corner slide: a straight move blocked by a tile corner nudges sideways around it
      // (otherwise big units pushed against a lane/connector corner stay wedged forever).
      const xMain = Math.abs(sx) >= Math.abs(sy);
      if (xMain ? !movedX : !movedY) {
        const a = Math.max(Math.abs(sx), Math.abs(sy));
        const opts = xMain ? [[sx, a], [sx, -a]] : [[a, sy], [-a, sy]];
        for (const [mx, my] of opts) {
          if (!this.circleBlocked(u.x + mx, u.y + my, r)) { u.x += mx; u.y += my; break; }
        }
      }
    }
    return bumped;
  }

  // Thick line of sight for a circle of radius r.
  los(x0, y0, x1, y1, r = 0) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1) return true;
    const step = 8;
    const n = Math.ceil(len / step);
    const rr = r * 0.75;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = x0 + dx * t, y = y0 + dy * t;
      if (rr > 0 ? this.circleBlocked(x, y, rr) : this.blockedTile(this.tileOf(x), this.tileOf(y))) return false;
    }
    return true;
  }

  nearestWalkable(px, py, r = 10) {
    let tx = this.tileOf(px), ty = this.tileOf(py);
    if (this.isWalkable(tx, ty) && !this.circleBlocked(px, py, r * 0.75)) return { x: px, y: py };
    let best = null, bestD = Infinity;
    for (let rad = 1; rad <= 12 && !best; rad++) {
      for (let y = ty - rad; y <= ty + rad; y++) {
        for (let x = tx - rad; x <= tx + rad; x++) {
          if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== rad) continue;
          if (!this.isWalkable(x, y)) continue;
          // closest point of that tile, pushed in by r
          const cx = Phaser.Math.Clamp(px, x * this.T + r, x * this.T + this.T - r);
          const cy = Phaser.Math.Clamp(py, y * this.T + r, y * this.T + this.T - r);
          const d = (cx - px) ** 2 + (cy - py) ** 2;
          if (d < bestD) { bestD = d; best = { x: cx, y: cy }; }
        }
      }
    }
    return best || { x: px, y: py };
  }

  // ---------------------------------------------------------- flow field
  canStepDiag(x, y, dx, dy) {
    return this.isWalkable(x + dx, y) && this.isWalkable(x, y + dy);
  }

  computeFlowField() {
    const dist = this.dist;
    dist.fill(Infinity);
    const heap = new MinHeap();
    const k = CONFIG.map.keep;
    // goals: lane tiles touching the Keep
    for (let y = k.y - 1; y <= k.y + k.h; y++) {
      for (let x = k.x - 1; x <= k.x + k.w; x++) {
        if (this.isLane(x, y)) {
          const i = this.idx(x, y);
          dist[i] = 0;
          heap.push(i, 0);
        }
      }
    }
    while (heap.size) {
      const i = heap.pop();
      const x = i % this.W, y = (i / this.W) | 0;
      const d = dist[i];
      for (const [dx, dy, c] of DIRS8) {
        const nx = x + dx, ny = y + dy;
        if (!this.isLane(nx, ny)) continue;
        if (dx !== 0 && dy !== 0) {
          // no diagonal corner cutting around terrain
          if (!this.isWalkable(x + dx, y) || !this.isWalkable(x, y + dy)) continue;
        }
        const ni = this.idx(nx, ny);
        const nd = d + c;
        if (nd < dist[ni]) { dist[ni] = nd; heap.push(ni, nd); }
      }
    }
    this.flowVersion = (this.flowVersion || 0) + 1;
  }

  // Next tile an enemy at pixel (px,py) should walk to, or null at the goal.
  flowNext(px, py) {
    const x = this.tileOf(px), y = this.tileOf(py);
    if (!this.inBounds(x, y)) return null;
    const i = this.idx(x, y);
    if (this.isLane(x, y) && this.dist[i] === 0) return null;
    let best = null, bestD = Infinity;
    for (const [dx, dy, c] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (!this.isLane(nx, ny)) continue;
      const ni = this.idx(nx, ny);
      if (dx !== 0 && dy !== 0 && (!this.isWalkable(x + dx, y) || !this.isWalkable(x, y + dy))) continue;
      const d = this.dist[ni] + c;
      if (d < bestD) { bestD = d; best = { tx: nx, ty: ny }; }
    }
    if (!best && !this.isLane(x, y)) {
      // off-lane: head to the nearest lane tile
      const p = this.nearestWalkable(px, py, 8);
      return { tx: this.tileOf(p.x), ty: this.tileOf(p.y) };
    }
    return best;
  }

  flowDistAt(px, py) {
    const x = this.tileOf(px), y = this.tileOf(py);
    if (!this.inBounds(x, y)) return Infinity;
    return this.dist[this.idx(x, y)];
  }

  // ---------------------------------------------------------- A*
  findPath(sx, sy, ex, ey, r = 12) {
    const W = this.W;
    let stx = this.tileOf(sx), sty = this.tileOf(sy);
    const goal = this.nearestWalkable(ex, ey, r);
    const gtx = this.tileOf(goal.x), gty = this.tileOf(goal.y);
    if (!this.isWalkable(stx, sty)) {
      const s = this.nearestWalkable(sx, sy, r);
      stx = this.tileOf(s.x); sty = this.tileOf(s.y);
    }
    const start = this.idx(stx, sty), end = this.idx(gtx, gty);
    if (start === end) return [goal];
    const g = this.gScore, came = this.cameFrom, closed = this.closed;
    g.fill(Infinity); closed.fill(0); came.fill(-1);
    const h = (x, y) => {
      const dx = Math.abs(x - gtx), dy = Math.abs(y - gty);
      return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };
    const heap = new MinHeap();
    g[start] = 0; heap.push(start, h(stx, sty));
    let found = false, iter = 0;
    while (heap.size && iter++ < 8000) {
      const i = heap.pop();
      if (closed[i]) continue;
      if (i === end) { found = true; break; }
      closed[i] = 1;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy, c] of DIRS8) {
        const nx = x + dx, ny = y + dy;
        if (!this.isWalkable(nx, ny)) continue;
        if (dx !== 0 && dy !== 0 && !this.canStepDiag(x, y, dx, dy)) continue;
        const ni = this.idx(nx, ny);
        if (closed[ni]) continue;
        const ng = g[i] + c;
        if (ng < g[ni]) { g[ni] = ng; came[ni] = i; heap.push(ni, ng + h(nx, ny)); }
      }
    }
    if (!found) return null;
    const tilesPath = [];
    for (let i = end; i !== -1 && i !== start; i = came[i]) tilesPath.push(i);
    tilesPath.reverse();
    const pts = tilesPath.map(i => ({ x: (i % W) * this.T + this.T / 2, y: ((i / W) | 0) * this.T + this.T / 2 }));
    pts[pts.length - 1] = goal;
    // string pulling
    const out = [];
    let cx = sx, cy = sy, k = 0;
    while (k < pts.length) {
      let far = k;
      for (let j = pts.length - 1; j > k; j--) {
        if (this.los(cx, cy, pts[j].x, pts[j].y, r)) { far = j; break; }
      }
      out.push(pts[far]);
      cx = pts[far].x; cy = pts[far].y;
      k = far + 1;
    }
    return out;
  }
}
