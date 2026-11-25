// Grid buildings: towers and gold mines. They block movement; enemies attack the ones in their way.

class Building {
  constructor(scene, type, tx, ty) {
    this.scene = scene;
    this.type = type;
    this.def = CONFIG.buildings[type];
    this.tx = tx; this.ty = ty;
    const fp = CONFIG.buildings.footprint;
    this.fp = fp;
    this.x = CONFIG.px(tx + fp / 2); this.y = CONFIG.px(ty + fp / 2);
    this.radius = CONFIG.px(fp / 2);
    this.level = 1;
    this.invested = this.def.cost;
    this.alive = true;
    this.isStructure = true;
    this.isBuilding = true;
    this.team = 'player';
    this.cd = 0.3;
    this.armor = CONFIG.buildings.armor;
    this.maxHp = this.hp = this.def.hp;
    this.flashT = 0;
    this.gfx = scene.add.graphics().setDepth(14).setPosition(this.x, this.y);
    this.redraw();
    Feel.popScale(this.gfx, 1.25, 100);
  }

  get range() { return (this.def.range || 0) + CONFIG.buildings.levelMul.range[this.level - 1]; }
  get damage() { return (this.def.damage || 0) * CONFIG.buildings.levelMul.damage[this.level - 1]; }
  get rate() { return (this.def.rate || 0) * CONFIG.buildings.levelMul.rate[this.level - 1]; }

  redraw(flash) {
    const g = this.gfx, d = this.def, h = CONFIG.px(this.fp / 2);
    g.clear();
    const base = flash ? 0xff8080 : d.color;
    if (this.type === 'mine') {
      g.fillStyle(base, 1); g.fillRect(-h + 4, -h + 4, h * 2 - 8, h * 2 - 8);
      g.lineStyle(3, 0x8a6d00, 1); g.strokeRect(-h + 4, -h + 4, h * 2 - 8, h * 2 - 8);
      g.fillStyle(0xfff3a0, 1); g.fillCircle(-8, 4, 8); g.fillCircle(8, -6, 6);
    } else {
      g.fillStyle(base, 1); g.fillRect(-h + 3, -h + 3, h * 2 - 6, h * 2 - 6);
      g.lineStyle(3, 0x2a2f38, 1); g.strokeRect(-h + 3, -h + 3, h * 2 - 6, h * 2 - 6);
      g.fillStyle(d.core, 1); g.fillCircle(0, 0, 10 + this.level * 2);
    }
    // level pips
    g.fillStyle(0xffd23f, 1);
    for (let i = 0; i < this.level; i++) g.fillRect(-h + 7 + i * 9, h - 12, 6, 6);
  }

  edgeDist(x, y) {
    const s = CONFIG.px(this.fp);
    const x0 = CONFIG.px(this.tx), y0 = CONFIG.px(this.ty);
    const cx = Math.max(x0, Math.min(x, x0 + s));
    const cy = Math.max(y0, Math.min(y, y0 + s));
    return Math.hypot(x - cx, y - cy);
  }

  onDamaged() { this.flashT = 0.08; this.redraw(true); }

  update(dt) {
    if (!this.alive) return;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.redraw(); }
    if (!this.def.range) return;
    this.cd -= dt;
    if (this.cd > 0) return;
    const target = Combat.nearestEnemy(this.x, this.y, this.range);
    if (!target) return;
    this.cd = 1 / this.rate;
    this.fire(target);
  }

  fire(target) {
    const d = this.def, sc = this.scene;
    const dmg = this.damage;
    if (this.type === 'arrow') {
      sc.spawnProjectile({
        x: this.x, y: this.y, target, speed: d.projSpeed, color: 0xffffff, kind: 'arrow',
        onHit: (p, t) => { if (t) Combat.dealDamage(t, dmg, { source: this }); },
      });
      Sfx.play('arrow');
    } else if (this.type === 'cannon') {
      // lead the target a bit
      const lead = Math.hypot(target.x - this.x, target.y - this.y) / d.projSpeed;
      const tx = target.x + target.vx * lead * 0.8, ty = target.y + target.vy * lead * 0.8;
      sc.spawnProjectile({
        x: this.x, y: this.y, tx, ty, speed: d.projSpeed, color: 0x222222, kind: 'ball', radius: 6,
        onHit: (p, t, x, y) => {
          for (const e of Combat.enemiesInRadius(x, y, d.aoe, true)) Combat.dealDamage(e, dmg, { source: this, knock: { x: e.x - x, y: e.y - y, force: 120 } });
          Feel.ring(x, y, d.aoe, 0xff9a3c, { duration: 280, fill: true });
          Feel.burst(x, y, 0xff9a3c, 10);
          Feel.shake(0.003, 90);
          Sfx.play('cannon');
        },
      });
    } else if (this.type === 'frost') {
      sc.spawnProjectile({
        x: this.x, y: this.y, target, speed: d.projSpeed, color: 0x5ee0ff, kind: 'ball', radius: 5,
        onHit: (p, t, x, y) => {
          for (const e of Combat.enemiesInRadius(x, y, d.aoe, true)) {
            Combat.dealDamage(e, dmg, { source: this, color: '#9fe9ff' });
            if (e.alive) e.applySlow(d.slow, d.slowTime);
          }
          Feel.ring(x, y, d.aoe, 0x5ee0ff, { duration: 250 });
        },
      });
      Sfx.play('shoot');
    }
  }

  upgradeCost() {
    if (this.level >= 3) return null;
    return Math.round(this.def.cost * CONFIG.buildings.upgradeCostMul[this.level - 1]);
  }
  canUpgradeTier() {
    return this.level < 2 || this.scene.keep.tier >= CONFIG.buildings.level3KeepTier;
  }
  upgrade() {
    const cost = this.upgradeCost();
    this.invested += cost;
    this.level++;
    const maxHp = Math.round(this.def.hp * CONFIG.buildings.levelMul.hp[this.level - 1]);
    this.hp += maxHp - this.maxHp;
    this.maxHp = maxHp;
    this.redraw();
    Feel.popScale(this.gfx, 1.35, 120);
    Feel.burst(this.x, this.y, 0xffd23f, 12);
  }
  sellValue() { return Math.floor(this.invested * CONFIG.buildings.sellRefund); }

  die() {
    if (!this.alive) return;
    Feel.burst(this.x, this.y, 0x9ca3af, 24);
    Feel.shake(0.006, 200);
    Sfx.play('explode');
    this.scene.events.emit('notice', this.def.name + ' destroyed');
    this.scene.events.emit('buildingLost', this);
    this.scene.removeBuilding(this);
  }

  destroy() {
    this.alive = false;
    if (this.gfx) { this.gfx.destroy(); this.gfx = null; }
  }
}
