// Balance simulation report: aggregates SimRecorder results, raises balance flags, renders Markdown,
// saves the last report to localStorage and downloads files.

const SimReport = {
  DIFFS: Object.keys(CONFIG.difficulty),

  mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; },
  median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; },
  sumInto(dst, src) { for (const k in src) dst[k] = (dst[k] || 0) + src[k]; return dst; },
  pct(x, total) { return total > 0 ? Math.round(x / total * 1000) / 10 : 0; },
  heroName(k) { return CONFIG.heroes[k] ? CONFIG.heroes[k].name : k; },
  diffName(k) { return CONFIG.difficulty[k] ? CONFIG.difficulty[k].label : k; },
  stratName(k) { return CONFIG.sim.strategies[k] ? CONFIG.sim.strategies[k].label : k; },

  // ------------------------------------------------------------------ aggregate
  build(runs, settings, meta) {
    const combos = {};
    for (const r of runs) {
      const key = r.hero + '|' + r.difficulty + '|' + r.strategy;
      (combos[key] = combos[key] || { hero: r.hero, difficulty: r.difficulty, strategy: r.strategy, runs: [] }).runs.push(r);
    }
    const list = Object.values(combos).map(c => this.aggregate(c, settings));
    const report = {
      version: 1,
      generated: new Date().toISOString(),
      settings, meta: Object.assign({ completed: runs.length }, meta),
      config: { difficulty: CONFIG.difficulty, waves: CONFIG.waves, heroes: CONFIG.heroes, skills: CONFIG.skills, buildings: CONFIG.buildings, items: CONFIG.items, keep: CONFIG.keep, sim: CONFIG.sim },
      combos: list,
      towerValue: this.towerValue(runs),
      skills: this.skillTable(runs),
      flags: [],
      runs,
    };
    report.flags = this.flags(report);
    return report;
  },

  aggregate(c, settings) {
    const R = c.runs, waves = R.map(r => r.wavesCleared);
    const dmg = {}, kills = {}, keepDmg = {}, heroDmg = {}, casts = {}, goldIn = {}, goldOut = {};
    for (const r of R) {
      this.sumInto(dmg, r.damage); this.sumInto(kills, r.kills_by); this.sumInto(keepDmg, r.keepDamage);
      this.sumInto(heroDmg, r.heroDamage); this.sumInto(casts, r.casts); this.sumInto(goldIn, r.goldIn); this.sumInto(goldOut, r.goldOut);
    }
    // Keep HP % after selected waves (mean over runs that cleared that wave)
    const keepHpAt = {};
    for (let w = 5; w <= settings.waveCap; w += 5) {
      const v = R.map(r => (r.waves.find(x => x[0] === w) || [])[2]).filter(x => x != null);
      if (v.length) keepHpAt[w] = Math.round(this.mean(v));
    }
    // first purchase wave per item
    const firstItem = {};
    for (const r of R) {
      const seen = {};
      for (const [w, kind, key] of r.purchases) if (kind === 'item' && !seen[key]) { seen[key] = 1; (firstItem[key] = firstItem[key] || []).push(w); }
    }
    for (const k in firstItem) firstItem[k] = Math.round(this.mean(firstItem[k]) * 10) / 10;
    return {
      hero: c.hero, difficulty: c.difficulty, strategy: c.strategy, n: R.length,
      waves: { mean: Math.round(this.mean(waves) * 10) / 10, min: Math.min(...waves), max: Math.max(...waves) },
      capped: R.filter(r => r.end === 'cap').length, stalled: R.filter(r => r.end === 'stalled').length,
      errors: R.filter(r => r.end === 'error').length, errorText: (R.find(r => r.error) || {}).error || '',
      time: Math.round(this.mean(R.map(r => r.time))),
      heroLevel: Math.round(this.mean(R.map(r => r.heroLevel)) * 10) / 10,
      heroDeaths: Math.round(this.mean(R.map(r => r.heroDeaths.length)) * 10) / 10,
      keepTier: Math.round(this.mean(R.map(r => r.keepTier)) * 10) / 10,
      goldEarned: Math.round(this.mean(R.map(r => r.goldEarned))),
      goldUnspent: Math.round(this.mean(R.map(r => r.goldUnspent))),
      damage: dmg, kills, keepDamage: keepDmg, heroDamage: heroDmg, casts, goldIn, goldOut, keepHpAt, firstItem,
    };
  },

  // Damage per gold for each building type and for Keep tiers (Keep arrows + allies).
  towerValue(runs) {
    const out = {};
    const add = (k, dmg, gold) => { const o = out[k] = out[k] || { damage: 0, gold: 0 }; o.damage += dmg; o.gold += gold; };
    for (const r of runs) {
      for (const t of ['arrow', 'cannon', 'frost']) if (r.goldOut[t]) add(t, r.damage['tower:' + t] || 0, r.goldOut[t]);
      if (r.goldOut.keep) add('keep tiers (Keep arrows only)', (r.damage.keep || 0), r.goldOut.keep);
    }
    for (const k in out) out[k].perGold = out[k].gold ? Math.round(out[k].damage / out[k].gold * 10) / 10 : 0;
    return out;
  },

  // Per hero: casts, damage per cast, share of hero damage (active-hero runs only).
  skillTable(runs) {
    const out = {};
    for (const r of runs) {
      if (CONFIG.sim.strategies[r.strategy] && CONFIG.sim.strategies[r.strategy].hero === 'idle') continue;
      const o = out[r.hero] = out[r.hero] || { minutes: 0, heroDamage: 0, keys: {} };
      o.minutes += r.time / 60;
      for (const k in r.damage) if (k.startsWith('hero:')) o.heroDamage += r.damage[k];
      for (const k of ['Q', 'W', 'E', 'R']) {
        const s = o.keys[k] = o.keys[k] || { casts: 0, damage: 0 };
        s.casts += r.casts[k] || 0;
        s.damage += r.damage['hero:' + k] || 0;
      }
      const a = o.keys.attack = o.keys.attack || { casts: 0, damage: 0 };
      a.damage += (r.damage['hero:attack'] || 0) + (r.damage['hero:chain'] || 0);
    }
    for (const h in out) {
      const o = out[h];
      for (const k in o.keys) {
        const s = o.keys[k];
        s.perCast = s.casts ? Math.round(s.damage / s.casts) : 0;
        s.perMin = o.minutes ? Math.round(s.casts / o.minutes * 10) / 10 : 0;
        s.share = this.pct(s.damage, o.heroDamage);
      }
    }
    return out;
  },

  // ------------------------------------------------------------------ flags
  flags(rep) {
    const F = CONFIG.sim.flags, flags = [], C = rep.combos;
    const get = (h, d, s) => C.find(c => c.hero === h && c.difficulty === d && c.strategy === s);
    const heroes = [...new Set(C.map(c => c.hero))], diffs = this.DIFFS.filter(d => C.some(c => c.difficulty === d));
    const strats = [...new Set(C.map(c => c.strategy))];
    const active = strats.filter(s => CONFIG.sim.strategies[s].hero !== 'idle');
    const cap = rep.settings.waveCap;
    const add = (severity, area, text) => flags.push({ severity, area, text });

    // hero vs hero
    if (heroes.length >= 2) {
      for (const d of diffs) {
        const avg = (h) => this.mean(active.map(s => get(h, d, s)).filter(Boolean).map(c => c.waves.mean));
        const [a, b] = heroes, wa = avg(a), wb = avg(b);
        if (!wa || !wb) continue;
        const hi = wa >= wb ? a : b, ratio = Math.max(wa, wb) / Math.min(wa, wb);
        if (ratio >= F.heroRatio) add('high', 'Heroes', `${this.diffName(d)}: ${this.heroName(hi)} survives ${ratio.toFixed(2)}× longer than ${this.heroName(hi === a ? b : a)} (avg ${Math.max(wa, wb).toFixed(1)} vs ${Math.min(wa, wb).toFixed(1)} waves over active strategies).`);
      }
    }
    // difficulty ordering
    for (const h of heroes) for (const s of strats) {
      for (let i = 0; i + 1 < diffs.length; i++) {
        const e = get(h, diffs[i], s), m = get(h, diffs[i + 1], s);
        if (!e || !m) continue;
        if (e.waves.mean >= cap && m.waves.mean >= cap) continue;
        if (m.waves.mean >= e.waves.mean) add('high', 'Difficulty', `${this.heroName(h)} · ${this.stratName(s)}: ${this.diffName(diffs[i + 1])} (${m.waves.mean}) is not harder than ${this.diffName(diffs[i])} (${e.waves.mean}).`);
      }
    }
    // strategy dominance / traps
    for (const h of heroes) for (const d of diffs) {
      const cs = active.map(s => get(h, d, s)).filter(Boolean);
      if (cs.length < 3) continue;
      const med = this.median(cs.map(c => c.waves.mean));
      const best = cs.reduce((a, b) => b.waves.mean > a.waves.mean ? b : a), worst = cs.reduce((a, b) => b.waves.mean < a.waves.mean ? b : a);
      if (med > 0 && best.waves.mean / med >= F.strategyRatio) add('medium', 'Strategies', `${this.heroName(h)} · ${this.diffName(d)}: ${this.stratName(best.strategy)} dominates (${best.waves.mean} waves vs median ${med}).`);
      if (worst.waves.mean > 0 && med / worst.waves.mean >= F.strategyRatio) add('medium', 'Strategies', `${this.heroName(h)} · ${this.diffName(d)}: ${this.stratName(worst.strategy)} is a trap (${worst.waves.mean} waves vs median ${med}).`);
      const idle = get(h, d, 'idle');
      if (idle && best.waves.mean > 0 && idle.waves.mean / best.waves.mean >= F.idleShare) add('high', 'Heroes', `${this.heroName(h)} · ${this.diffName(d)}: an idle hero reaches ${idle.waves.mean} waves, ${Math.round(idle.waves.mean / best.waves.mean * 100)}% of the best active strategy (${best.waves.mean}). The hero matters little.`);
    }
    // tower value
    const tv = rep.towerValue, towers = ['arrow', 'cannon', 'frost'].filter(t => tv[t] && tv[t].gold > 0);
    if (towers.length >= 2) {
      const med = this.median(towers.map(t => tv[t].perGold));
      for (const t of towers) {
        const r = tv[t].perGold / (med || 1);
        if (r >= F.towerValueRatio) add('medium', 'Buildings', `${CONFIG.buildings[t].name} is strong: ${tv[t].perGold} damage per gold vs median ${med}.`);
        else if (r <= 1 / F.towerValueRatio) add('medium', 'Buildings', `${CONFIG.buildings[t].name} is weak: ${tv[t].perGold} damage per gold vs median ${med}.`);
      }
    }
    // skills
    for (const h in rep.skills) for (const k of ['Q', 'W', 'E', 'R']) {
      const s = rep.skills[h].keys[k];
      if (!s) continue;
      if (h === 'warrior' && (k === 'E' || k === 'W')) continue;   // Bloodthirst and Rage deal no damage of their own
      if (s.share / 100 < F.lowSkillShare) add('low', 'Skills', `${this.heroName(h)} ${k} ${CONFIG.skills[h][k].name}: ${s.share}% of hero damage (${s.casts} casts, ${s.perCast} dmg/cast).`);
    }
    // Keep damage by enemy type
    for (const d of diffs) {
      const kd = {};
      for (const c of C) if (c.difficulty === d) this.sumInto(kd, c.keepDamage);
      const tot = Object.values(kd).reduce((a, b) => a + b, 0);
      for (const t in kd) if (tot > 0 && kd[t] / tot > F.keepDamageShare) add('medium', 'Enemies', `${this.diffName(d)}: ${CONFIG.enemies[t] ? CONFIG.enemies[t].name : t} deals ${this.pct(kd[t], tot)}% of all Keep damage.`);
    }
    // early losses, caps, stalls
    for (const c of C) {
      const name = `${this.heroName(c.hero)} · ${this.diffName(c.difficulty)} · ${this.stratName(c.strategy)}`;
      if (c.waves.min < F.earlyLossWave) add('high', 'Runs', `${name}: a run fell before wave ${F.earlyLossWave} (min ${c.waves.min}).`);
      if (c.capped === c.n) add('low', 'Runs', `${name}: every run reached the wave cap (${cap}). Raise the cap to tell it apart.`);
      if (c.errors) add('high', 'Runs', `${name}: ${c.errors} run(s) crashed with a game exception: ${c.errorText}`);
    }
    const order = { high: 0, medium: 1, low: 2 };
    return flags.sort((a, b) => order[a.severity] - order[b.severity]);
  },

  // ------------------------------------------------------------------ markdown
  markdown(rep) {
    const L = [], s = rep.settings, m = rep.meta, C = rep.combos;
    const fmtT = (sec) => Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
    const table = (head, rows) => { L.push('| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'); rows.forEach(r => L.push('| ' + r.join(' | ') + ' |')); L.push(''); };
    const diffs = this.DIFFS.filter(d => s.difficulties.includes(d));
    const get = (h, d, st) => C.find(c => c.hero === h && c.difficulty === d && c.strategy === st);

    L.push('# Balance simulation report', '');
    L.push(`Generated ${rep.generated}. ${m.completed}/${m.planned} runs${m.cancelled ? ' (cancelled early)' : ''} in ${fmtT(m.realTime)} real time.`);
    L.push(`Heroes: ${s.heroes.map(h => this.heroName(h)).join(', ')} · Difficulties: ${diffs.map(d => this.diffName(d)).join(', ')} · Strategies: ${s.strategies.map(x => this.stratName(x)).join(', ')} · Seeds: ${s.seeds} · Wave cap: ${s.waveCap}`, '');
    L.push('Waves are waves cleared. "+" marks a run that hit the wave cap. A bot plays the hero (see `CONFIG.sim.bot`), so absolute numbers reflect the bot, not a skilled player. Compare rows and columns rather than reading single values.', '');

    L.push('## Flags', '');
    if (!rep.flags.length) L.push('No flags raised.');
    for (const f of rep.flags) L.push(`- **${f.severity.toUpperCase()}** [${f.area}] ${f.text}`);
    L.push('');

    L.push('## Waves cleared (mean [min–max])', '');
    const rows = [];
    for (const h of s.heroes) for (const st of s.strategies) {
      rows.push([this.heroName(h), this.stratName(st)].concat(diffs.map(d => {
        const c = get(h, d, st);
        return c ? `${c.waves.mean} [${c.waves.min}–${c.waves.max}]${c.capped ? ' +' + c.capped : ''}` : '–';
      })));
    }
    table(['Hero', 'Strategy'].concat(diffs.map(d => this.diffName(d))), rows);

    L.push('## Damage share by source (% of damage dealt to enemies)', '');
    const srcCols = [['Atk', ['hero:attack', 'hero:chain', 'hero:thorns']], ['Q', ['hero:Q']], ['W', ['hero:W']], ['E', ['hero:E']], ['R', ['hero:R']],
      ['Arrow', ['tower:arrow']], ['Cannon', ['tower:cannon']], ['Frost', ['tower:frost']], ['Keep', ['keep']], ['Allies', ['ally:soldier', 'ally:archer']]];
    table(['Hero', 'Diff', 'Strategy'].concat(srcCols.map(x => x[0])), C.map(c => {
      const tot = Object.values(c.damage).reduce((a, b) => a + b, 0);
      return [this.heroName(c.hero), this.diffName(c.difficulty), this.stratName(c.strategy)].concat(srcCols.map(([, ks]) => this.pct(ks.reduce((a, k) => a + (c.damage[k] || 0), 0), tot)));
    }));

    L.push('## Building value (damage per gold spent, all runs)', '');
    table(['Source', 'Damage', 'Gold', 'Dmg/gold'], Object.entries(rep.towerValue).map(([k, v]) => [CONFIG.buildings[k] ? CONFIG.buildings[k].name : k, Math.round(v.damage), v.gold, v.perGold]));

    L.push('## Skills (active-hero runs)', '');
    for (const h in rep.skills) {
      const o = rep.skills[h];
      L.push(`**${this.heroName(h)}**: ${Math.round(o.heroDamage)} hero damage over ${Math.round(o.minutes)} min`, '');
      table(['Skill', 'Casts', 'Casts/min', 'Dmg/cast', '% hero dmg'], ['attack', 'Q', 'W', 'E', 'R'].filter(k => o.keys[k]).map(k => {
        const x = o.keys[k];
        return [k === 'attack' ? 'Basic attacks (+chain)' : k + ' ' + CONFIG.skills[h][k].name, k === 'attack' ? '–' : x.casts, k === 'attack' ? '–' : x.perMin, k === 'attack' ? '–' : x.perCast, x.share];
      }));
    }

    L.push('## Hero', '');
    table(['Hero', 'Diff', 'Strategy', 'Final level', 'Deaths/run', 'Damage taken by type'], C.map(c => {
      const tot = Object.values(c.heroDamage).reduce((a, b) => a + b, 0);
      const top = Object.entries(c.heroDamage).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${this.pct(v, tot)}%`).join(', ');
      return [this.heroName(c.hero), this.diffName(c.difficulty), this.stratName(c.strategy), c.heroLevel, c.heroDeaths, top || '–'];
    }));

    L.push('## Keep', '');
    const hpWaves = []; for (let w = 5; w <= s.waveCap; w += 5) hpWaves.push(w);
    table(['Hero', 'Diff', 'Strategy', 'Final tier', 'Damage taken by type'].concat(hpWaves.map(w => 'HP% w' + w)), C.map(c => {
      const tot = Object.values(c.keepDamage).reduce((a, b) => a + b, 0);
      const top = Object.entries(c.keepDamage).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${this.pct(v, tot)}%`).join(', ');
      return [this.heroName(c.hero), this.diffName(c.difficulty), this.stratName(c.strategy), c.keepTier, top || '–'].concat(hpWaves.map(w => c.keepHpAt[w] != null ? c.keepHpAt[w] : '–'));
    }));

    L.push('## Economy (mean per run)', '');
    const outCats = ['keep', 'arrow', 'cannon', 'frost', 'mine'];
    table(['Hero', 'Diff', 'Strategy', 'Earned', 'Bounty', 'Wave tick', 'Mines', 'Unspent'].concat(outCats.map(k => 'Spent ' + k)), C.map(c => {
      const per = (v) => Math.round((v || 0) / c.n);
      return [this.heroName(c.hero), this.diffName(c.difficulty), this.stratName(c.strategy), c.goldEarned, per(c.goldIn.bounty), per(c.goldIn.tick), per(c.goldIn.mines), c.goldUnspent].concat(outCats.map(k => per(c.goldOut[k])));
    }));

    L.push('## Items: mean wave of first purchase', '');
    const items = CONFIG.itemOrder.filter(k => C.some(c => c.firstItem[k] != null));
    if (items.length) table(['Hero', 'Diff', 'Strategy'].concat(items.map(k => CONFIG.items[k].name)), C.filter(c => Object.keys(c.firstItem).length).map(c =>
      [this.heroName(c.hero), this.diffName(c.difficulty), this.stratName(c.strategy)].concat(items.map(k => c.firstItem[k] != null ? c.firstItem[k] : '–'))));

    L.push('## Runs', '');
    table(['Hero', 'Diff', 'Strategy', 'Seed', 'Waves', 'End', 'Time', 'Level', 'Kills', 'Deaths', 'Keep tier', 'Items'], rep.runs.map(r =>
      [this.heroName(r.hero), this.diffName(r.difficulty), this.stratName(r.strategy), r.seed, r.wavesCleared, r.end, fmtT(r.time), r.heroLevel, r.kills, r.heroDeaths.length, r.keepTier,
        Object.entries(r.items).map(([k, v]) => k + v).join(' ') || '–']));
    return L.join('\n');
  },

  // ------------------------------------------------------------------ storage / download
  save(rep) {
    const key = CONFIG.sim.storageKey;
    try { localStorage.setItem(key, JSON.stringify(rep)); return; } catch (e) { /* too big: drop per-wave detail */ }
    try {
      const slim = Object.assign({}, rep, { runs: rep.runs.map(r => Object.assign({}, r, { waves: [], purchases: [] })) });
      localStorage.setItem(key, JSON.stringify(slim));
    } catch (e) { /* ignore */ }
  },

  load() {
    try { return JSON.parse(localStorage.getItem(CONFIG.sim.storageKey) || 'null'); } catch (e) { return null; }
  },

  download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  fileStem(rep) { return 'balance-report-' + rep.generated.slice(0, 19).replace(/[:T]/g, '-'); },
};
