// Balance simulation scenes: setup panel, progress HUD (runs over GameScene), report screen.

function simButton(scene, x, y, w, h, label, onClick, opts = {}) {
  const color = opts.color || 0x1f2937;
  const r = scene.add.rectangle(x, y, w, h, color).setOrigin(0).setStrokeStyle(2, opts.stroke || 0x4b5563).setInteractive({ useHandCursor: true });
  const t = scene.add.text(x + w / 2, y + h / 2, label, { fontFamily: FONT, fontSize: (opts.size || 15) + 'px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
  r.on('pointerover', () => r.setFillStyle(opts.hover || 0x374151));
  r.on('pointerout', () => r.setFillStyle(r.baseColor || color));
  r.on('pointerdown', (p) => { if (p && p.rightButtonDown && p.rightButtonDown()) return; Sfx.resume(); Sfx.play('click'); onClick(); });
  r.baseColor = color;
  return { r, t };
}

// ==================================================================== setup
class SimSetupScene extends Phaser.Scene {
  constructor() { super('SimSetupScene'); }

  create() {
    this.cameras.main.setBackgroundColor('#0f1a12');
    const S = CONFIG.sim;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('cd_sim_settings') || 'null'); } catch (e) { /* ignore */ }
    const valid = (arr, keys) => Array.isArray(arr) ? arr.filter(k => keys.includes(k)) : null;
    const heroes = Object.keys(CONFIG.heroes), diffs = Object.keys(CONFIG.difficulty), strats = Object.keys(S.strategies);
    this.sel = {
      heroes: (saved && valid(saved.heroes, heroes)) || heroes.slice(),
      difficulties: (saved && valid(saved.difficulties, diffs)) || diffs.slice(),
      strategies: (saved && valid(saved.strategies, strats)) || strats.slice(),
      seeds: (saved && saved.seeds) || S.defaultSeeds,
      waveCap: (saved && saved.waveCap) || S.defaultWaveCap,
    };

    this.add.text(640, 50, 'BALANCE SIMULATION', { fontFamily: FONT, fontSize: '40px', color: '#ffd23f', fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
    this.add.text(640, 92, 'A bot plays every selected combination in the real game at high speed, then writes a balance report.', { fontFamily: FONT, fontSize: '15px', color: '#cbd5e1' }).setOrigin(0.5);

    this.chips = [];
    const section = (y, title) => this.add.text(140, y, title, { fontFamily: FONT, fontSize: '15px', color: '#9ca3af', fontStyle: 'bold' });
    section(130, 'HEROES');
    heroes.forEach((k, i) => this.chip(140 + i * 190, 152, 175, CONFIG.heroes[k].name, 'heroes', k));
    section(210, 'DIFFICULTIES');
    diffs.forEach((k, i) => this.chip(140 + i * 190, 232, 175, CONFIG.difficulty[k].label, 'difficulties', k));
    section(290, 'STRATEGIES');
    strats.forEach((k, i) => {
      const x = 140 + (i % 3) * 340, y = 312 + Math.floor(i / 3) * 78;
      const st = S.strategies[k];
      this.chip(x, y, 320, st.label, 'strategies', k);
      const desc = (st.hero === 'idle' ? 'Hero idles at the Keep. ' : '') + (st.opening.length ? 'Open: ' + st.opening.join(', ') + '. ' : '') + 'Loop: ' + st.loop.join(', ');
      this.add.text(x + 4, y + 42, desc, { fontFamily: FONT, fontSize: '11px', color: '#9ca3af', wordWrap: { width: 316 } });
    });

    section(480, 'SEEDS PER COMBINATION');
    this.stepper(140, 502, 'seeds', 1, 1, 20);
    section(480, 'WAVE CAP').setX(500);
    this.stepper(500, 502, 'waveCap', 5, 5, 200);

    this.summary = this.add.text(640, 570, '', { fontFamily: FONT, fontSize: '16px', color: '#ffffff' }).setOrigin(0.5);
    simButton(this, 440, 610, 180, 52, 'Back', () => this.scene.start('MenuScene'));
    this.startBtn = simButton(this, 660, 610, 180, 52, 'RUN', () => this.run(), { color: 0x7a2a2a, hover: 0x9a3a3a, stroke: 0xff6060, size: 20 });
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('MenuScene'));
    this.refresh();
  }

  chip(x, y, w, label, group, key) {
    const b = simButton(this, x, y, w, 38, label, () => {
      const arr = this.sel[group], i = arr.indexOf(key);
      if (i >= 0) arr.splice(i, 1); else arr.push(key);
      this.refresh();
    });
    this.chips.push({ b, group, key });
  }

  stepper(x, y, field, step, min, max) {
    const val = this.add.text(x + 110, y + 19, '', { fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    simButton(this, x, y, 50, 38, '−', () => { this.sel[field] = Math.max(min, this.sel[field] - step); this.refresh(); }, { size: 20 });
    simButton(this, x + 170, y, 50, 38, '+', () => { this.sel[field] = Math.min(max, this.sel[field] + step); this.refresh(); }, { size: 20 });
    (this.steppers = this.steppers || []).push({ val, field });
  }

  count() {
    const s = this.sel;
    return s.heroes.length * s.difficulties.length * s.strategies.length * s.seeds;
  }

  refresh() {
    for (const c of this.chips) {
      const on = this.sel[c.group].includes(c.key);
      c.b.r.baseColor = on ? 0x2f4a2f : 0x1f2937;
      c.b.r.setFillStyle(c.b.r.baseColor).setStrokeStyle(2, on ? 0x7cf29a : 0x4b5563);
      c.b.t.setColor(on ? '#ffffff' : '#6b7280');
    }
    for (const s of this.steppers || []) s.val.setText(String(this.sel[s.field]));
    const n = this.count();
    this.summary.setText(n ? `${n} runs · up to ${this.sel.waveCap} waves each. Long runs can take a while; you can cancel and keep a partial report.` : 'Select at least one hero, difficulty and strategy.');
  }

  run() {
    if (!this.count()) { Sfx.play('error'); return; }
    // keep the user's order stable: config order, not click order
    const order = (arr, keys) => keys.filter(k => arr.includes(k));
    const s = this.sel;
    const settings = {
      heroes: order(s.heroes, Object.keys(CONFIG.heroes)),
      difficulties: order(s.difficulties, Object.keys(CONFIG.difficulty)),
      strategies: order(s.strategies, Object.keys(CONFIG.sim.strategies)),
      seeds: s.seeds, waveCap: s.waveCap,
    };
    try { localStorage.setItem('cd_sim_settings', JSON.stringify(settings)); } catch (e) { /* ignore */ }
    SimRunner.start(this, settings);
  }
}

// ==================================================================== progress HUD
class SimHudScene extends Phaser.Scene {
  constructor() { super('SimHudScene'); }

  create() {
    const x = 340, y = 250, w = 600, h = 220;
    this.panel = this.add.graphics();
    this.panel.fillStyle(0x0f131a, 0.92); this.panel.fillRoundedRect(x, y, w, h, 10);
    this.panel.lineStyle(2, 0x3a4252, 1); this.panel.strokeRoundedRect(x, y, w, h, 10);
    this.add.text(x + 20, y + 16, 'BALANCE SIMULATION', { fontFamily: FONT, fontSize: '20px', color: '#ffd23f', fontStyle: 'bold' });
    this.line1 = this.add.text(x + 20, y + 52, '', { fontFamily: FONT, fontSize: '16px', color: '#ffffff' });
    this.line2 = this.add.text(x + 20, y + 78, '', { fontFamily: FONT, fontSize: '14px', color: '#cbd5e1' });
    this.bar = this.add.graphics();
    this.line3 = this.add.text(x + 20, y + 132, '', { fontFamily: FONT, fontSize: '13px', color: '#9ca3af' });
    this.watchBtn = simButton(this, x + 20, y + 162, 170, 40, 'Watch: ' + (SimRunner.watch ? 'ON' : 'OFF'), () => {
      SimRunner.setWatch(!SimRunner.watch);
      this.watchBtn.t.setText('Watch: ' + (SimRunner.watch ? 'ON' : 'OFF'));
    });
    simButton(this, x + w - 190, y + 162, 170, 40, 'Cancel', () => SimRunner.cancel(), { color: 0x5a1f1f, hover: 0x7a2a2a, stroke: 0xff6060 });
    this.box = { x, y, w, h };
    this.input.keyboard.on('keydown-ESC', () => SimRunner.cancel());
  }

  update() {
    const P = SimRunner.progress(), sc = SimRunner.current, B = this.box;
    const fmt = (s) => s == null ? '…' : Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    if (P.job) this.line1.setText(`Run ${Math.min(P.done + 1, P.total)}/${P.total}:  ${CONFIG.heroes[P.job.hero].name} · ${CONFIG.difficulty[P.job.difficulty].label} · ${CONFIG.sim.strategies[P.job.strategy].label} · seed ${P.job.seed}`);
    if (sc && sc.waves && sc.keep && sc.hero) {
      this.line2.setText(`Wave ${sc.waves.wave} / cap ${SimRunner.settings.waveCap}   ·   Keep ${Math.max(0, Math.round(sc.keep.hp / sc.keep.maxHp * 100))}% (tier ${sc.keep.tier})   ·   Hero Lv ${sc.hero.level}   ·   Gold ${sc.economy.gold}`);
    }
    const g = this.bar, bx = B.x + 20, by = B.y + 106, bw = B.w - 40;
    g.clear();
    g.fillStyle(0x000000, 0.6); g.fillRect(bx, by, bw, 14);
    g.fillStyle(0x7cf29a, 1); g.fillRect(bx, by, bw * (P.total ? P.done / P.total : 0), 14);
    this.line3.setText(`Speed ${Math.round(P.speed)}× real time   ·   elapsed ${fmt(P.elapsed)}   ·   ETA ${fmt(P.eta)}`);
    // move the panel out of the way while watching
    const ty = SimRunner.watch ? 720 - B.h - 10 - B.y : 0;
    this.cameras.main.setScroll(0, -ty);
  }
}

// ==================================================================== report
class SimReportScene extends Phaser.Scene {
  constructor() { super('SimReportScene'); }

  init(data) { this.report = (data && data.report) || SimReport.load(); }

  create() {
    this.cameras.main.setBackgroundColor('#0f1a12');
    const rep = this.report;
    this.add.text(640, 34, 'BALANCE REPORT', { fontFamily: FONT, fontSize: '34px', color: '#ffd23f', fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
    simButton(this, 330, 660, 150, 44, 'Menu', () => this.scene.start('MenuScene'));
    simButton(this, 500, 660, 150, 44, 'New run', () => this.scene.start('SimSetupScene'));
    if (!rep) {
      this.add.text(640, 300, 'No report saved yet.', { fontFamily: FONT, fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
      return;
    }
    simButton(this, 670, 660, 150, 44, 'Download .md', () => SimReport.download(SimReport.fileStem(rep) + '.md', SimReport.markdown(rep), 'text/markdown'), { color: 0x1f3a5a, hover: 0x2a4f7a });
    simButton(this, 840, 660, 150, 44, 'Download .json', () => SimReport.download(SimReport.fileStem(rep) + '.json', JSON.stringify(rep, null, 1), 'application/json'), { color: 0x1f3a5a, hover: 0x2a4f7a });

    const m = rep.meta, s = rep.settings;
    const mins = Math.floor(m.realTime / 60) + ':' + String(Math.floor(m.realTime % 60)).padStart(2, '0');
    this.add.text(640, 66, `${rep.generated.slice(0, 16).replace('T', ' ')}  ·  ${m.completed}/${m.planned} runs${m.cancelled ? ' (cancelled)' : ''}  ·  ${mins} real time  ·  ${s.seeds} seed(s)  ·  wave cap ${s.waveCap}`,
      { fontFamily: FONT, fontSize: '13px', color: '#9ca3af' }).setOrigin(0.5);

    // ---- headline: waves cleared, hero·strategy × difficulty
    const diffs = SimReport.DIFFS.filter(d => s.difficulties.includes(d));
    const x0 = 40, colW = 120, rowH = 21;
    let y = 92;
    this.add.text(x0, y, 'WAVES CLEARED (mean, min–max)', { fontFamily: FONT, fontSize: '14px', color: '#9ca3af', fontStyle: 'bold' });
    y += 22;
    diffs.forEach((d, i) => this.add.text(x0 + 230 + i * colW, y, CONFIG.difficulty[d].label, { fontFamily: FONT, fontSize: '13px', color: '#cbd5e1', fontStyle: 'bold' }));
    y += rowH;
    const all = rep.combos.map(c => c.waves.mean), hi = Math.max(1, ...all);
    for (const h of s.heroes) for (const st of s.strategies) {
      if (!rep.combos.some(c => c.hero === h && c.strategy === st)) continue;
      this.add.text(x0, y, `${SimReport.heroName(h)} · ${SimReport.stratName(st)}`, { fontFamily: FONT, fontSize: '13px', color: '#ffffff' });
      diffs.forEach((d, i) => {
        const c = rep.combos.find(c => c.hero === h && c.difficulty === d && c.strategy === st);
        if (!c) return;
        const g = this.add.graphics();
        g.fillStyle(0x3b82f6, 0.35); g.fillRect(x0 + 226 + i * colW, y, (colW - 8) * c.waves.mean / hi, rowH - 4);
        this.add.text(x0 + 230 + i * colW, y + 1, `${c.waves.mean} (${c.waves.min}–${c.waves.max})${c.capped ? '+' : ''}`, { fontFamily: FONT, fontSize: '12px', color: '#ffffff' });
      });
      y += rowH;
      if (y > 630) break;
    }

    // ---- flags (scrollable)
    const fx = 640, fy = 92, fw = 600, fh = 548;
    this.add.text(fx, fy, `FLAGS (${rep.flags.length})`, { fontFamily: FONT, fontSize: '14px', color: '#9ca3af', fontStyle: 'bold' });
    const col = { high: '#ff7a7a', medium: '#ffd23f', low: '#9ca3af' };
    const lines = rep.flags.length ? rep.flags : [{ severity: 'low', area: '', text: 'No flags raised.' }];
    const cont = this.add.container(fx, fy + 24);
    let ly = 0;
    for (const f of lines) {
      const t = this.add.text(0, ly, (f.area ? `[${f.area}] ` : '') + f.text, { fontFamily: FONT, fontSize: '13px', color: col[f.severity], wordWrap: { width: fw - 10 } });
      cont.add(t);
      ly += t.height + 6;
    }
    const maskG = this.make.graphics({ add: false });
    maskG.fillStyle(0xffffff); maskG.fillRect(fx, fy + 24, fw, fh - 24);
    cont.setMask(maskG.createGeometryMask());
    const maxScroll = Math.max(0, ly - (fh - 24));
    this.input.on('wheel', (p, objs, dx, dy) => { cont.y = Phaser.Math.Clamp(cont.y - dy * 0.6, fy + 24 - maxScroll, fy + 24); });
    if (maxScroll > 0) this.add.text(fx + fw, fy, 'scroll for more', { fontFamily: FONT, fontSize: '11px', color: '#6b7280' }).setOrigin(1, 0);
    this.add.text(640, 712, 'Full tables (damage share, building value, skills, economy, Keep HP, items, every run) are in the downloads.', { fontFamily: FONT, fontSize: '11px', color: '#6b7280' }).setOrigin(0.5, 1);
  }
}
