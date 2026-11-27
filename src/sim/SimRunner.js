// Balance simulation orchestrator: runs every selected hero × strategy × seed through the real
// GameScene (driven by SimBot) and collects SimRecorder results in `results`. Headless only: tools/simpar.mjs
// drives it and builds the SimReport.
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
  current: null,
  origRandom: null,
  cancelled: false,

  // settings: { heroes: [], strategies: [], seeds, waveCap, shard? }
  // shard { i, n } keeps every n-th job from i on, so n windows (tools/simpar.mjs) split one job list.
  start(fromScene, settings) {
    let jobs = [];
    for (const hero of settings.heroes)
      for (const strategy of settings.strategies)
        for (let i = 0; i < settings.seeds; i++)
          jobs.push({ hero, strategy, seed: CONFIG.sim.baseSeed + i });
    if (settings.shard) jobs = jobs.filter((_, k) => k % settings.shard.n === settings.shard.i);
    if (!jobs.length) return false;
    Object.assign(this, { active: true, jobs, idx: 0, results: [], settings, current: null, cancelled: false });
    Feel.enabled = false;
    Sfx.suppressed = true;
    this.launchJob(fromScene, jobs[0]);
    return true;
  },

  launchJob(fromScene, job) {
    fromScene.scene.start('GameScene', { hero: job.hero, sim: job });
  },

  // GameScene.create (first thing): deterministic dice for this run.
  beginRun(scene) {
    if (!this.origRandom) this.origRandom = Math.random;
    Math.random = mulberry32(scene.simJob.seed);
    this.current = scene;
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

  // Stop now; `results` keeps the runs that finished.
  cancel() {
    if (!this.active) return;
    this.cancelled = true;
    const sc = this.current;
    if (sc) { sc.ended = true; this.finish(sc); }
  },

  finish(scene) {
    if (this.origRandom) { Math.random = this.origRandom; this.origRandom = null; }
    Feel.enabled = true;
    Sfx.suppressed = false;
    this.active = false;
    this.current = null;
    scene.scene.start('MenuScene');
  },
};
