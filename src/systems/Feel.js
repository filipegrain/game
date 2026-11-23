// Game feel: settings, sound, shapes, particles, damage numbers, shake, hitstop, rings, trails.

const Settings = {
  data: { shake: true, mute: false },
  load() {
    try { Object.assign(this.data, JSON.parse(localStorage.getItem('cd_settings') || '{}')); } catch (e) { /* ignore */ }
  },
  save() { try { localStorage.setItem('cd_settings', JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
  toggle(key) { this.data[key] = !this.data[key]; this.save(); return this.data[key]; },
};
Settings.load();

// ------------------------------------------------------------------ SOUND (WebAudio synth)
const Sfx = {
  ctx: null,
  master: null,
  last: {},
  ensure() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch (e) { return false; }
    return true;
  },
  resume() { if (this.ensure() && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(freq, dur, type = 'square', vol = 0.3, slideTo = null, delay = 0) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.3, filterFreq = 1200, delay = 0) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    if (!this.noiseBuf) {
      const len = ctx.sampleRate * 1;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },
  suppressed: false,     // true while the balance simulation runs
  play(name) {
    if (this.suppressed || Settings.data.mute || !this.ensure()) return;
    if (this.ctx.state === 'suspended') return;
    const now = performance.now();
    const minGap = { hit: 45, shoot: 60, enemyHit: 70, gold: 60, arrow: 70, death: 50, meteor: 40 }[name] || 0;
    if (this.last[name] && now - this.last[name] < minGap) return;
    this.last[name] = now;
    switch (name) {
      case 'click': this.tone(660, 0.05, 'square', 0.12); break;
      case 'move': this.tone(520, 0.04, 'sine', 0.08); break;
      case 'hit': this.tone(180, 0.08, 'square', 0.18, 90); this.noise(0.05, 0.12, 2500); break;
      case 'enemyHit': this.tone(140, 0.07, 'sawtooth', 0.12, 70); break;
      case 'shoot': this.tone(900, 0.06, 'triangle', 0.1, 500); break;
      case 'arrow': this.noise(0.05, 0.08, 4000); break;
      case 'cannon': this.noise(0.25, 0.3, 500); this.tone(90, 0.2, 'sine', 0.3, 40); break;
      case 'swoosh': this.noise(0.14, 0.22, 3000); this.tone(300, 0.12, 'sine', 0.08, 900); break;
      case 'dash': this.noise(0.2, 0.25, 1800); this.tone(200, 0.18, 'sawtooth', 0.12, 600); break;
      case 'thump': this.tone(70, 0.35, 'sine', 0.5, 35); this.noise(0.3, 0.35, 400); break;
      case 'explode': this.noise(0.3, 0.3, 900); this.tone(110, 0.25, 'sine', 0.25, 40); break;
      case 'meteor': this.noise(0.35, 0.32, 700); this.tone(80, 0.3, 'sine', 0.3, 30); break;
      case 'frost': this.tone(1400, 0.25, 'sine', 0.12, 600); this.noise(0.2, 0.1, 6000); break;
      case 'blink': this.tone(400, 0.15, 'sine', 0.15, 1600); break;
      case 'cry': this.tone(220, 0.3, 'sawtooth', 0.2, 160); this.tone(330, 0.3, 'square', 0.08, 240); break;
      case 'death': this.tone(240, 0.12, 'square', 0.1, 60); break;
      case 'gold': this.tone(1200, 0.05, 'square', 0.07); this.tone(1600, 0.06, 'square', 0.07, null, 0.05); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.15, 'square', 0.12, null, i * 0.07)); break;
      case 'build': this.tone(300, 0.08, 'square', 0.15); this.tone(450, 0.08, 'square', 0.12, null, 0.06); break;
      case 'error': this.tone(140, 0.12, 'square', 0.15); break;
      case 'wave': this.tone(196, 0.4, 'sawtooth', 0.15); this.tone(147, 0.5, 'sawtooth', 0.15, null, 0.25); break;
      case 'keepHit': this.tone(90, 0.15, 'square', 0.2, 60); break;
      case 'buy': this.tone(880, 0.06, 'square', 0.1); this.tone(1320, 0.08, 'square', 0.1, null, 0.06); break;
      case 'ready': this.tone(1000, 0.05, 'sine', 0.06); break;
      case 'heroDeath': this.tone(300, 0.6, 'sawtooth', 0.2, 50); break;
      case 'boss': this.tone(60, 0.8, 'sawtooth', 0.3, 40); this.noise(0.6, 0.2, 300); break;
    }
  },
};

// ------------------------------------------------------------------ SHAPES
function drawShape(g, shape, r, color, opts = {}) {
  const alpha = opts.alpha == null ? 1 : opts.alpha;
  g.fillStyle(color, alpha);
  if (opts.line) g.lineStyle(opts.line, opts.lineColor == null ? 0x000000 : opts.lineColor, opts.lineAlpha == null ? 0.6 : opts.lineAlpha);
  const pts = shapePoints(shape, r);
  if (!pts) {
    g.fillCircle(0, 0, r);
    if (opts.line) g.strokeCircle(0, 0, r);
  } else {
    g.fillPoints(pts, true);
    if (opts.line) g.strokePoints(pts, true);
  }
}

function shapePoints(shape, r) {
  switch (shape) {
    case 'triangle': return [{ x: r * 1.15, y: 0 }, { x: -r * 0.8, y: r * 0.95 }, { x: -r * 0.8, y: -r * 0.95 }];
    case 'square': return [{ x: -r, y: -r }, { x: r, y: -r }, { x: r, y: r }, { x: -r, y: r }];
    case 'diamond': return [{ x: r * 1.2, y: 0 }, { x: 0, y: r }, { x: -r * 1.2, y: 0 }, { x: 0, y: -r }];
    case 'hexagon': {
      const p = [];
      for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; p.push({ x: Math.cos(a) * r, y: Math.sin(a) * r }); }
      return p;
    }
    default: return null;
  }
}

// ------------------------------------------------------------------ FEEL (per GameScene)
const Feel = {
  scene: null,
  enabled: true,      // false while the balance simulation runs: no particles, numbers, shake or hitstop
  emitters: {},
  numbers: [],
  init(scene) {
    this.scene = scene;
    this.emitters = {};
    this.numbers = [];
    if (!scene.textures.exists('px')) {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 6, 6);
      g.generateTexture('px', 6, 6); g.destroy();
    }
    for (let i = 0; i < CONFIG.feel.damageNumberPool; i++) {
      const t = scene.add.text(0, 0, '', { fontFamily: 'Arial Black, Arial', fontSize: '14px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 })
        .setOrigin(0.5).setDepth(60).setVisible(false);
      t.busy = false;
      this.numbers.push(t);
    }
  },

  emitter(color) {
    if (!this.emitters[color]) {
      const e = this.scene.add.particles(0, 0, 'px', {
        speed: { min: 60, max: 260 }, angle: { min: 0, max: 360 }, lifespan: { min: 250, max: 520 },
        scale: { start: 1, end: 0 }, alpha: { start: 1, end: 0.2 }, tint: color, emitting: false,
      });
      e.setDepth(40);
      this.emitters[color] = e;
    }
    return this.emitters[color];
  },

  burst(x, y, color, count = 10) {
    if (!this.enabled) return;
    if (!this.scene) return;
    this.emitter(color).explode(count, x, y);
  },

  damageNumber(x, y, amount, opts = {}) {
    if (!this.enabled) return;
    const t = this.numbers.find(n => !n.busy);
    if (!t) return;
    t.busy = true;
    const crit = !!opts.crit;
    t.setText(crit ? amount + '!' : String(amount));
    t.setFontSize(crit ? 22 : (opts.small ? 12 : 15));
    t.setColor(opts.color || (crit ? '#ffd23f' : '#ffffff'));
    t.setPosition(x + Phaser.Math.Between(-8, 8), y).setVisible(true).setAlpha(1).setScale(crit ? 1.4 : 1);
    this.scene.tweens.add({
      targets: t, y: y - (crit ? 46 : 32), alpha: 0, scale: 1, duration: crit ? 800 : 600, ease: 'Cubic.easeOut',
      onComplete: () => { t.setVisible(false); t.busy = false; },
    });
  },

  floatText(x, y, text, color = '#ffffff', size = 16, dur = 900) {
    if (!this.enabled) return;
    const t = this.scene.add.text(x, y, text, { fontFamily: 'Arial Black, Arial', fontSize: size + 'px', color, stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5).setDepth(62);
    this.scene.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: dur, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  },

  shake(intensity = 0.005, duration = 120) {
    if (!this.enabled) return;
    if (!Settings.data.shake || !this.scene) return;
    this.scene.cameras.main.shake(duration, intensity);
  },

  hitstop(seconds) {
    if (!this.enabled) return;
    if (!this.scene) return;
    this.scene.hitstop = Math.max(this.scene.hitstop || 0, seconds);
  },

  ring(x, y, radius, color, opts = {}) {
    if (!this.enabled) return;
    const g = this.scene.add.graphics().setDepth(opts.depth || 35);
    g.setPosition(x, y);
    const dur = opts.duration || 350;
    const from = opts.from == null ? radius * 0.3 : opts.from;
    const width = opts.width || 4;
    const state = { r: from, a: opts.alpha || 0.9 };
    const draw = () => {
      g.clear();
      if (opts.fill) { g.fillStyle(color, state.a * 0.25); g.fillCircle(0, 0, state.r); }
      g.lineStyle(width, color, state.a); g.strokeCircle(0, 0, state.r);
    };
    draw();
    this.scene.tweens.add({ targets: state, r: radius, a: 0, duration: dur, ease: 'Cubic.easeOut', onUpdate: draw, onComplete: () => g.destroy() });
  },

  clickRing(x, y, color) {
    this.ring(x, y, 4, color, { from: 18, duration: 260, width: 2.5, depth: 5 });
  },

  arc(x, y, radius, angle, arcRad, color, duration = 220) {
    if (!this.enabled) return;
    const g = this.scene.add.graphics().setDepth(34).setPosition(x, y);
    const state = { a: 0.75, r: radius * 0.6 };
    const draw = () => {
      g.clear();
      g.fillStyle(color, state.a * 0.45);
      g.slice(0, 0, state.r, angle - arcRad / 2, angle + arcRad / 2, false);
      g.fillPath();
      g.lineStyle(4, 0xffffff, state.a);
      g.beginPath(); g.arc(0, 0, state.r, angle - arcRad / 2, angle + arcRad / 2, false); g.strokePath();
    };
    draw();
    this.scene.tweens.add({ targets: state, a: 0, r: radius, duration, ease: 'Quad.easeOut', onUpdate: draw, onComplete: () => g.destroy() });
  },

  afterimage(x, y, shape, r, color, rotation = 0, alpha = 0.5) {
    if (!this.enabled) return;
    const g = this.scene.add.graphics().setDepth(18).setPosition(x, y).setRotation(rotation);
    drawShape(g, shape, r, color, { alpha });
    this.scene.tweens.add({ targets: g, alpha: 0, scale: 0.8, duration: 220, onComplete: () => g.destroy() });
  },

  flashRect(x, y, w, h, color, dur = 200) {
    if (!this.enabled) return;
    const r = this.scene.add.rectangle(x, y, w, h, color, 0.7).setDepth(36);
    this.scene.tweens.add({ targets: r, alpha: 0, duration: dur, onComplete: () => r.destroy() });
  },

  popScale(obj, scale = 1.25, dur = 90) {
    if (!this.enabled) return;
    if (!obj || !obj.scene) return;
    obj.scene.tweens.add({ targets: obj, scale, duration: dur, yoyo: true, ease: 'Quad.easeOut', onComplete: () => obj.setScale && obj.setScale(1) });
  },
};
