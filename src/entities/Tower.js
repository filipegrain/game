// Allied lane tower: fixed on the map, shoots enemies, can be destroyed for good.
// The first tower of a lane (closest to the Keep) spawns that lane's creeps; once it falls, the lane gets none.

class Tower {
  constructor(scene, lane, order, def) {
    this.scene = scene;
    this.lane = lane;
    this.order = order;          // 0 = closest to the Keep
    this.x = CONFIG.px(def.x); this.y = CONFIG.px(def.y);
    this.radius = 26;
    this.alive = true;
    this.isStructure = true;
    this.isTower = true;
    this.team = 'player';
    this.armor = CONFIG.tower.armor;
    this.cd = Math.random() * 0.5;
    this.flashT = 0;
    this.maxHp = this.hp = CONFIG.tower.hp;
    this.mul = 1;
    this.gfx = scene.add.graphics().setDepth(14).setPosition(this.x, this.y);
    this.applyTier(scene.keep.tier);
    this.redraw();
  }

  get range() { return CONFIG.tower.range; }
  get damage() { return CONFIG.tower.damage * this.mul; }

  // Keep tier → stats. Gained max HP is also healed.
  applyTier(tier) {
    this.mul = 1 + CONFIG.keep.tierScaling * (tier - 1);
    const maxHp = Math.round(CONFIG.tower.hp * this.mul);
    this.hp += maxHp - this.maxHp;
    this.maxHp = maxHp;
  }

  redraw(flash) {
    const g = this.gfx, r = this.radius;
    g.clear();
    g.fillStyle(0x000000, 0.3); g.fillCircle(3, 5, r);
    g.fillStyle(flash ? 0xff8080 : 0x2b3140, 1); g.fillRect(-r, -r, r * 2, r * 2);
    g.lineStyle(3, 0x11151c, 1); g.strokeRect(-r, -r, r * 2, r * 2);
    g.fillStyle(flash ? 0xffb0b0 : 0x4b5568, 1); g.fillRect(-r + 6, -r + 6, r * 2 - 12, r * 2 - 12);
    g.fillStyle(0x3b82f6, 1); g.fillCircle(0, 0, 8);
    if (this.order === 0) { g.lineStyle(2, 0x93c5fd, 0.9); g.strokeCircle(0, 0, 13); }   // creep spawner
  }

  edgeDist(px, py) {
    const r = this.radius;
    const cx = Math.max(this.x - r, Math.min(px, this.x + r));
    const cy = Math.max(this.y - r, Math.min(py, this.y + r));
    return Math.hypot(px - cx, py - cy);
  }

  onDamaged() { this.flashT = 0.08; this.redraw(true); }

  update(dt) {
    if (!this.alive) return;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.redraw(); }
    this.cd -= dt;
    if (this.cd > 0) return;
    const target = Combat.nearestEnemy(this.x, this.y, this.range);
    if (!target) return;
    this.cd = 1 / CONFIG.tower.rate;
    const dmg = this.damage;
    this.scene.spawnProjectile({
      x: this.x, y: this.y - 10, target, speed: CONFIG.tower.projSpeed, color: 0x9fd0ff, kind: 'arrow',
      onHit: (p, t) => { if (t) Combat.dealDamage(t, dmg, { source: this }); },
    });
    Sfx.play('arrow');
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    Feel.burst(this.x, this.y, 0x4b5568, 40);
    Feel.shake(0.01, 300);
    Sfx.play('explode');
    const lane = CONFIG.map.spawns[this.lane].name;
    this.scene.events.emit('notice', this.order === 0 ? lane + ' lane tower destroyed: no more creeps on ' + lane : lane + ' lane tower destroyed');
    this.scene.ping(this.x, this.y, 0xff3030);
    this.scene.events.emit('towerLost', this);
    if (this.gfx) { this.gfx.destroy(); this.gfx = null; }
  }
}
