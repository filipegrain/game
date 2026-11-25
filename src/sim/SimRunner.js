// Balance simulation orchestrator: runs every selected hero × difficulty × strategy × seed through the real
// GameScene (driven by SimBot), collects SimRecorder results and hands them to SimReport.
// While it runs: Math.random is seeded per run, Feel effects and sound are off, best scores are not written.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SimRunner = {
  active: false,
  jobs: [],
  idx: 0,
  results: [],
  settings: null,
  watch: false,
  current: null,
  origRandom: null,
  speed: 0,
  startReal: 0,
  cancelled: false,

  // settings: { heroes: [], difficulties: [], strategies: [], seeds, waveCap }
  start(fromScene, settings) {
    const jobs = [];
    for (const hero of settings.heroes)
      for (const difficulty of settings.difficulties)
        for (const strategy of settings.strategies)
          for (let i = 0; i < settings.seeds; i++)
            jobs.push({ hero, difficulty, strategy, seed: CONFIG.sim.baseSeed + i });
    if (!jobs.length) return false;
    Object.assign(this, { active: true, jobs, idx: 0, results: [], settings, current: null, speed: 0, lastFrame: 0, cancelled: false, startReal: performance.now() });
    Feel.enabled = false;
    Sfx.suppressed = true;
    fromScene.scene.launch('SimHudScene');
    fromScene.scene.bringToTop('SimHudScene');
    this.launchJob(fromScene, jobs[0]);
    return true;
  },

  launchJob(fromScene, job) {
    fromScene.scene.start('GameScene', { hero: job.hero, difficulty: job.difficulty, sim: job });
  },

  // GameScene.create (first thing): deterministic dice for this run.
  beginRun(scene) {
    if (!this.origRandom) this.origRandom = Math.random;
    Math.random = mulberry32(scene.simJob.seed);
    this.current = scene;
  },

  attach(scene) {
    scene.cameras.main.setVisible(this.watch);
    scene.scene.bringToTop('SimHudScene');
  },

  setWatch(v) {
    this.watch = v;
    const sc = this.current;
    if (sc && sc.sys.isActive()) sc.cameras.main.setVisible(v);
  },

  // Real ms to spend stepping this frame. Throttled frames (background tab, occluded window) get a bigger
  // share of their long interval so the simulation keeps moving; capped so the HUD stays responsive.
  budget() {
    const S = CONFIG.sim, gap = this.lastFrame ? performance.now() - this.lastFrame : 0;
    return Math.max(S.frameBudgetMs, Math.min(S.maxFrameBudgetMs, gap * 0.85));
  },

  // Speed = game seconds per real second, measured on real timestamps (Phaser smooths/caps `delta`).
  onFrame(scene, simSeconds) {
    const now = performance.now();
    if (this.lastFrame) {
      const x = simSeconds / Math.max(0.001, (now - this.lastFrame) / 1000);
      this.speed = this.speed ? this.speed * 0.9 + x * 0.1 : x;
    }
    this.lastFrame = now;
  },

  checkRunEnd(scene) {
    if (scene.stats.wavesCleared >= this.settings.waveCap) this.endRun(scene, 'cap');
  },

  endRun(scene, reason) {
    scene.ended = true;
    if (this.cancelled) return;
    this.results.push(scene.recorder.result(reason));
    this.idx++;
    if (this.idx >= this.jobs.length) { this.finish(scene); return; }
    this.launchJob(scene, this.jobs[this.idx]);
  },

  // Stop now; the report covers the runs that finished.
  cancel() {
    if (!this.active) return;
    this.cancelled = true;
    const sc = this.current;
    if (sc) { sc.ended = true; this.finish(sc); }
  },

  restore() {
    if (this.origRandom) { Math.random = this.origRandom; this.origRandom = null; }
    Feel.enabled = true;
    Sfx.suppressed = false;
    this.active = false;
    this.current = null;
  },

  finish(scene) {
    const realTime = (performance.now() - this.startReal) / 1000;
    this.restore();
    scene.scene.stop('SimHudScene');
    if (!this.results.length) { scene.scene.start('MenuScene'); return; }   // cancelled before any run finished: keep the last report
    const report = SimReport.build(this.results, this.settings, { cancelled: this.cancelled, realTime, planned: this.jobs.length });
    SimReport.save(report);
    scene.scene.start('SimReportScene', { report });
  },

  progress() {
    const done = this.idx, total = this.jobs.length;
    const el = (performance.now() - this.startReal) / 1000;
    const eta = done > 0 ? el / done * (total - done) : null;
    return { done, total, elapsed: el, eta, job: this.jobs[this.idx], speed: this.speed };
  },
};
