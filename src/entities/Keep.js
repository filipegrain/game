// The Keep: lose condition. Its tier powers up lane towers and creeps; it shoots arrows at higher tiers.

class Keep {
  constructor(scene) {
    this.scene = scene;
    const k = CONFIG.map.keep, T = CONFIG.TILE;
    this.rx = k.x * T; this.ry = k.y * T; this.rw = k.w * T; this.rh = k.h * T;
    this.x = this.rx + this.rw / 2; this.y = this.ry + this.rh / 2;
    this.radius = this.rw / 2;
    this.tier = 1;
    this.maxHp = CONFIG.keep.tiers[0].hp; this.hp = this.maxHp;
    this.alive = true;
    this.isStructure = true;
    this.team = 'player';
    this.armor = 5;
    this.atkCd = 0;
    this.flashT = 0;
    this.gfx = scene.add.graphics().setDepth(13);
    this.redraw();
  }

  // Where the hero spawns and respawns: just off the Keep's south-east corner, clear of the mid tower.
  get front() { return { x: this.rx + this.rw + 40, y: this.ry + this.rh + 30 }; }

  get tierDef() { return CONFIG.keep.tiers[this.tier - 1]; }
  get nextTierDef() { return CONFIG.keep.tiers[this.tier] || null; }

  redraw(flash) {
    const g = this.gfx;
    g.clear();
    const x = this.rx, y = this.ry, w = this.rw, h = this.rh;
    const wallC = flash ? 0xff6060 : [0x6b7280, 0x7b8494, 0x8c96a8, 0xa3aec2][this.tier - 1];
    g.fillStyle(0x2a2f38, 1); g.fillRect(x - 6, y - 6, w + 12, h + 12);
    g.fillStyle(wallC, 1); g.fillRect(x, y, w, h);
    g.lineStyle(3, 0x1f2329, 1); g.strokeRect(x, y, w, h);
    // inner keep
    g.fillStyle(flash ? 0xff9090 : 0x4b5563, 1); g.fillRect(x + w * 0.25, y + h * 0.25, w * 0.5, h * 0.5);
    g.fillStyle(0x3b82f6, 1); g.fillRect(x + w * 0.42, y + h * 0.42, w * 0.16, h * 0.16);
    // corner towers grow with tier
    const ts = 18 + this.tier * 4;
    g.fillStyle(flash ? 0xffb0b0 : 0x9ca3af, 1);
    [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => {
      g.fillRect(cx - ts / 2, cy - ts / 2, ts, ts);
      g.lineStyle(2, 0x1f2329, 1); g.strokeRect(cx - ts / 2, cy - ts / 2, ts, ts);
    });
    // tier banners
    g.fillStyle(0xffd23f, 1);
    for (let i = 0; i < this.tier; i++) g.fillRect(x + 8 + i * 12, y + h - 14, 8, 8);
  }

  edgeDist(px, py) {
    const cx = Math.max(this.rx, Math.min(px, this.rx + this.rw));
    const cy = Math.max(this.ry, Math.min(py, this.ry + this.rh));
    return Math.hypot(px - cx, py - cy);
  }

  upgrade() {
    const next = this.nextTierDef;
    if (!next) return false;
    const gain = next.hp - this.tierDef.hp;
    this.tier++;
    this.maxHp = next.hp;
    this.hp = Math.min(this.maxHp, this.hp + gain);
    for (const t of this.scene.towers) if (t.alive) t.applyTier(this.tier);
    this.redraw();
    Feel.ring(this.x, this.y, 260, 0xffd23f, { duration: 600, width: 6 });
    Feel.burst(this.x, this.y, 0xffd23f, 30);
    Feel.floatText(this.x, this.ry - 20, 'KEEP TIER ' + this.tier, '#ffd23f', 22, 1400);
    Sfx.play('levelup');
    return true;
  }

  onDamaged() {
    this.flashT = 0.1;
    this.redraw(true);
    Sfx.play('keepHit');
    this.scene.events.emit('keepHit');
  }

  update(dt) {
    if (!this.alive) return;
    const td = this.tierDef;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.redraw(); }
    if (td.repair) {
      for (const s of Combat.structuresInRadius(this.x, this.y, CONFIG.keep.repairRadius)) s.hp = Math.min(s.maxHp, s.hp + td.repair * dt);
    }

    // attack
    if (td.attack) {
      this.atkCd -= dt;
      if (this.atkCd <= 0) {
        const targets = Combat.enemiesByDistance(this.x, this.y, td.attack.range).slice(0, td.attack.shots);
        if (targets.length) {
          this.atkCd = 1 / td.attack.rate;
          for (const t of targets) {
            this.scene.spawnProjectile({
              x: this.x, y: this.y - 20, target: t, speed: 800, color: 0xffe08a, kind: 'arrow',
              onHit: (p, tgt) => { if (tgt) Combat.dealDamage(tgt, td.attack.damage, { source: this }); },
            });
          }
          Sfx.play('arrow');
        }
      }
    }
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    Feel.burst(this.x, this.y, 0x9ca3af, 60);
    Feel.burst(this.x, this.y, 0xff5030, 40);
    Feel.shake(0.02, 600);
    Sfx.play('explode');
    this.scene.gameOver();
  }
}
