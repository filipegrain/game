// Grid placement, selection, upgrade / sell.

class BuildSystem {
  constructor(scene) {
    this.scene = scene;
    this.placing = null;     // building type being placed
    this.selected = null;    // Building or Keep
  }

  get keep() { return this.scene.keep; }

  isUnlocked(type) { return this.keep.tier >= CONFIG.buildings[type].tier; }

  // Placement rules that don't depend on the route (cheap: the ghost and build grid call this every frame).
  check(type, tx, ty) {
    const p = this.scene.pathing, m = CONFIG.map, def = CONFIG.buildings[type], k = m.keep, T = CONFIG.TILE;
    const fp = CONFIG.buildings.footprint;
    let oob = false, occupied = false, terrain = false, nearKeep = false;
    p.forEachFootprint(tx, ty, fp, (x, y) => {
      if (!p.inBounds(x, y)) { oob = true; return; }
      if (p.buildingAt(x, y) || p.tileType(x, y) === TILE_T.KEEP) occupied = true;
      else if (!p.isBuildable(x, y)) terrain = true;
      if (x >= k.x - 1 && x <= k.x + k.w && y >= k.y - 1 && y <= k.y + k.h) nearKeep = true;
    });
    if (oob) return { ok: false, reason: 'Out of bounds' };
    if (!this.isUnlocked(type)) return { ok: false, reason: 'Requires Keep tier ' + def.tier };
    if (occupied) return { ok: false, reason: 'Occupied' };
    if (terrain) return { ok: false, reason: 'Build on grass or dirt' };
    if (nearKeep) return { ok: false, reason: 'Too close to the Keep' };
    const cx = tx + fp / 2, cy = ty + fp / 2;
    if (this.scene.towers.some(t => t.alive && Math.abs(t.x / T - cx) < fp && Math.abs(t.y / T - cy) < fp)) return { ok: false, reason: 'Occupied' };
    if (m.spawns.some(s => Math.hypot(s.x - cx, s.y - cy) < m.spawnClear)) return { ok: false, reason: 'Too close to an enemy spawn' };
    if (m.camps.some(s => Math.hypot(s.x - cx, s.y - cy) < m.campClear)) return { ok: false, reason: 'Too close to a camp' };
    if (!this.scene.economy.canAfford(def.cost)) return { ok: false, reason: 'Not enough gold', gold: true };
    return { ok: true };
  }

  // check + the route rule: enemies must still reach the Keep from every spawn.
  checkPlace(type, tx, ty) {
    const c = this.check(type, tx, ty);
    if (!c.ok) return c;
    if (this.scene.pathing.wouldDisconnect(tx, ty, CONFIG.buildings.footprint)) return { ok: false, reason: 'Would block every path to the Keep' };
    return c;
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
    const c = this.checkPlace(this.placing, tx, ty);
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
