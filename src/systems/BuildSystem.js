// Grid placement, selection, upgrade / sell.

class BuildSystem {
  constructor(scene) {
    this.scene = scene;
    this.placing = null;     // building type being placed
    this.selected = null;    // Building or Keep
  }

  get keep() { return this.scene.keep; }

  isUnlocked(type) { return this.keep.tier >= CONFIG.buildings[type].tier; }

  inBuildRadius(tx, ty) {
    const k = CONFIG.map.keep, fp = CONFIG.buildings.footprint;
    const kx = k.x + k.w / 2, ky = k.y + k.h / 2;
    return Math.hypot(tx + fp / 2 - kx, ty + fp / 2 - ky) <= this.keep.buildRadius;
  }

  check(type, tx, ty) {
    const p = this.scene.pathing, m = CONFIG.map, def = CONFIG.buildings[type], k = m.keep;
    const fp = CONFIG.buildings.footprint;
    let oob = false, occupied = false, blocked = false, nearKeep = false;
    p.forEachFootprint(tx, ty, fp, (x, y) => {
      if (!p.inBounds(x, y)) { oob = true; return; }
      if (p.buildingAt(x, y) || p.tileType(x, y) === TILE_T.KEEP) occupied = true;
      if (p.tileType(x, y) !== TILE_T.TERRAIN) blocked = true;
      // stay off the Keep's walls
      if (x >= k.x - 1 && x <= k.x + k.w && y >= k.y - 1 && y <= k.y + k.h) nearKeep = true;
    });
    if (oob) return { ok: false, reason: 'Out of bounds' };
    if (!this.isUnlocked(type)) return { ok: false, reason: 'Requires Keep tier ' + def.tier };
    if (occupied) return { ok: false, reason: 'Occupied' };
    if (!this.inBuildRadius(tx, ty)) return { ok: false, reason: 'Outside build area (upgrade the Keep)' };
    if (blocked) return { ok: false, reason: 'Buildings go next to lanes, not on them' };
    const a = m.towerAdjacency;
    let near = false;
    p.forEachFootprint(tx, ty, fp, (x, y) => {
      if (near) return;
      for (let yy = y - a; yy <= y + a && !near; yy++)
        for (let xx = x - a; xx <= x + a; xx++) if (p.isLane(xx, yy)) { near = true; break; }
    });
    if (!near) return { ok: false, reason: 'Must be next to a lane' };
    if (nearKeep) return { ok: false, reason: 'Too close to the Keep' };
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
    this.scene.hero.aiming = null;
    this.scene.events.emit('buildModeChanged');
  }

  cancel() {
    const had = !!this.placing;
    this.placing = null;
    if (had) this.scene.events.emit('buildModeChanged');
    return had;
  }

  tryPlaceAt(wx, wy) {
    if (!this.placing) return false;
    const p = this.scene.pathing;
    const tx = p.tileOf(wx), ty = p.tileOf(wy);
    const c = this.check(this.placing, tx, ty);
    if (!c.ok) {
      Sfx.play('error'); this.scene.events.emit('notice', c.reason);
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

  sellSelected() {
    const b = this.selected;
    if (!b || !b.alive || b === this.keep) return;
    this.scene.economy.add(b.sellValue(), b.x, b.y - 10);
    Sfx.play('gold');
    this.scene.removeBuilding(b);
    this.select(null);
  }

  drawGhost(g, wx, wy) {
    if (!this.placing) return;
    const p = this.scene.pathing, def = CONFIG.buildings[this.placing];
    const fp = CONFIG.buildings.footprint, s = CONFIG.px(fp);
    const k = CONFIG.map.keep;
    // build area
    g.lineStyle(2, 0xffd23f, 0.25);
    g.strokeCircle(CONFIG.px(k.x + k.w / 2), CONFIG.px(k.y + k.h / 2), CONFIG.px(this.keep.buildRadius));
    const tx = p.tileOf(wx), ty = p.tileOf(wy);
    const c = this.check(this.placing, tx, ty);
    const col = c.ok ? 0x44ff66 : 0xff4444;
    const x0 = CONFIG.px(tx), y0 = CONFIG.px(ty);
    g.fillStyle(col, 0.35); g.fillRect(x0, y0, s, s);
    g.lineStyle(2, col, 0.9); g.strokeRect(x0, y0, s, s);
    g.lineStyle(1, col, 0.35);
    for (let i = 1; i < fp; i++) {
      const d = CONFIG.px(i);
      g.lineBetween(x0 + d, y0, x0 + d, y0 + s);
      g.lineBetween(x0, y0 + d, x0 + s, y0 + d);
    }
    if (def.range) {
      g.lineStyle(1.5, col, 0.5);
      g.strokeCircle(x0 + s / 2, y0 + s / 2, def.range);
    }
    this.ghostReason = c.ok ? null : c.reason;
  }
}
