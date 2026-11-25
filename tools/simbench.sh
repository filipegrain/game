#!/bin/sh
# Wall time of a fixed sim job in the headless Chrome `cdg launch` started. Same seeds every time, so runs compare.
C="$(dirname "$0")/../.claude/skills/verify-castle-defense/scripts/cdg.mjs"
node "$C" eval "(() => { window.__t0 = performance.now(); SimRunner.start(game.scene.getScene(game.scene.isActive('MenuScene') ? 'MenuScene' : 'SimReportScene'), { heroes: ['warrior'], difficulties: ['normal'], strategies: ['turtle'], seeds: 3, waveCap: 12 }); return 1; })()" >/dev/null
node "$C" wait "!SimRunner.active" 300000 >/dev/null
node "$C" eval "(() => { const R = SimRunner.results, t = R.reduce((a, r) => a + r.time, 0), ms = performance.now() - __t0; return { realS: +(ms / 1000).toFixed(2), gameS: t, speed: Math.round(t / ms * 1000), waves: R.map(r => r.wavesCleared), kills: R.map(r => r.kills) }; })()"
