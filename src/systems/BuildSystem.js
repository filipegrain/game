// Grid placement, selection, upgrade / repair / sell.

class BuildSystem {
  constructor(scene) {
    this.scene = scene;
    this.placing = null;     // building type being placed
    this.selected = null;    // Building or Keep
    this.lastPaintTile = null;
  }

  get keep() { return this.scene.keep; }

  isUnlocked(type) { return this.keep.tier >= CONFIG.buildings[type].tier; }

  inBuildRadius(tx, ty) {
    const k = CONFIG.map.keep;
    const kx = k.x + k.w / 2, ky = k.y + k.h / 2;
    return Math.hypot(tx + 0.5 - kx, ty + 0.5 - ky) <= this.keep.buildRadius;
  }

  check(type, tx, ty) {
    const p = this.scene.pathing, m = CONFIG.map, def = CONFIG.buildings[type];
    if (!p.inBounds(tx, ty)) return { ok: false, reason: 'Out of bounds' };
    if (!this.isUnlocked(type)) return { ok: false, reason: 'Requires Keep tier ' + def.tier };
    if (p.buildingAt(tx, ty)) return { ok: false, reason: 'Occupied' };
    const t = p.tileType(tx, ty);
    if (t === TILE_T.KEEP) return { ok: false, reason: 'Occupied' };
    if (!this.inBuildRadius(tx, ty)) return { ok: false, reason: 'Outside build area (upgrade the Keep)' };
    if (def.onPath) {
      if (t === TILE_T.CONNECTOR) return { ok: false, reason: 'Connectors must stay open' };
      if (t !== TILE_T.PATH) return { ok: false, reason: 'Walls go on lanes' };
      if (tx < m.keepNoBuildX) return { ok: false, reason: 'Too close to the Keep' };
      if (tx >= m.spawnZoneX) return { ok: false, reason: 'Too close to the spawn' };
      // keep units from getting sealed inside walls: don't allow on a tile where the hero stands
      const h = this.scene.hero;
      if (h.alive && p.tileOf(h.x) === tx && p.tileOf(h.y) === ty) return { ok: false, reason: 'Hero is standing there' };
    } else {
      if (t !== TILE_T.TERRAIN) return { ok: false, reason: 'Towers go next to lanes, not on them' };
      const a = m.towerAdjacency;
      let near = false;
      for (let y = ty - a; y <= ty + a && !near; y++)
        for (let x = tx - a; x <= tx + a; x++) if (p.isLane(x, y)) { near = true; break; }
      if (!near) return { ok: false, reason: 'Must be next to a lane' };
      // stay off the Keep's walls
      const k = m.keep;
      if (tx >= k.x - 1 && tx <= k.x + k.w && ty >= k.y - 1 && ty <= k.y + k.h) return { ok: false, reason: 'Too close to the Keep' };
    }
    if (!this.scene.economy.canAfford(def.cost)) return { ok: false, reason: 'Not enough gold', gold: true };
    return { ok: true };
  }

  startPlacing(type) {
    if (!this.isUnlocked(type)) {
      Sfx.play('error');
      this.scene.events.emit('notice', CONFIG.buildings[type].name + ' requires Keep tier ' + CONFIG.buildings[type].tier);
      return;
    }
    this.placing = type;
    this.selected = null;
    this.scene.events.emit('buildModeChanged');
  }

  cancel() {
    const had = !!this.placing;
    this.placing = null;
    this.lastPaintTile = null;
    if (had) this.scene.events.emit('buildModeChanged');
    return had;
  }

  tryPlaceAt(wx, wy, silent = false) {
    if (!this.placing) return false;
    const p = this.scene.pathing;
    const tx = p.tileOf(wx), ty = p.tileOf(wy);
    const key = tx + ',' + ty;
    if (silent && this.lastPaintTile === key) return false;
    this.lastPaintTile = key;
    const c = this.check(this.placing, tx, ty);
    if (!c.ok) {
      if (!silent) { Sfx.play('error'); this.scene.events.emit('notice', c.reason); }
      return false;
    }
    const def = CONFIG.buildings[this.placing];
    if (!this.scene.economy.spend(def.cost)) return false;
    const b = new Building(this.scene, this.placing, tx, ty);
    this.scene.addBuilding(b);
    Sfx.play('build');
    Feel.burst(b.x, b.y, 0xbbbbbb, 8);
    return true;
  }

  select(obj) {
    this.selected = obj;
    this.scene.events.emit('selectionChanged');
  }

  upgradeSelected() {
    const b = this.selected;
    if (!b || !b.alive) return;
    if (b === this.keep) { this.scene.upgradeKeep(); return; }
    const cost = b.upgradeCost();
    if (cost == null) { Sfx.play('error'); this.scene.events.emit('notice', 'Max level'); return; }
    if (!b.canUpgradeTier()) { Sfx.play('error'); this.scene.events.emit('notice', 'Level 3 requires Keep tier ' + CONFIG.buildings.level3KeepTier); return; }
    if (!this.scene.economy.spend(cost)) return;
    b.upgrade();
    Sfx.play('build');
    this.scene.events.emit('selectionChanged');
  }

  repairSelected() {
    const b = this.selected;
    if (!b || !b.alive || b === this.keep) return;
    const cost = b.repairCost();
    if (cost <= 0) return;
    if (!this.scene.economy.spend(cost)) return;
    b.hp = b.maxHp;
    Feel.burst(b.x, b.y, 0x7cd67c, 10);
    Sfx.play('build');
  }

  sellSelected() {
    const b = this.selected;
    if (!b || !b.alive || b === this.keep) return;
    this.scene.economy.add(b.sellValue(), b.x, b.y - 10);
    Sfx.play('gold');
    this.scene.removeBuilding(b, false);
    this.select(null);
  }

  drawGhost(g, wx, wy) {
    if (!this.placing) return;
    const p = this.scene.pathing, T = CONFIG.TILE, def = CONFIG.buildings[this.placing];
    const k = CONFIG.map.keep;
    // build area
    g.lineStyle(2, 0xffd23f, 0.25);
    g.strokeCircle((k.x + k.w / 2) * T, (k.y + k.h / 2) * T, this.keep.buildRadius * T);
    const tx = p.tileOf(wx), ty = p.tileOf(wy);
    const c = this.check(this.placing, tx, ty);
    const col = c.ok ? 0x44ff66 : 0xff4444;
    g.fillStyle(col, 0.35); g.fillRect(tx * T, ty * T, T, T);
    g.lineStyle(2, col, 0.9); g.strokeRect(tx * T, ty * T, T, T);
    if (def.range) {
      g.lineStyle(1.5, col, 0.5);
      g.strokeCircle(tx * T + T / 2, ty * T + T / 2, def.range);
    }
    this.ghostReason = c.ok ? null : c.reason;
  }
}
