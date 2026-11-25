// Converts a palette map sketch (PNG) into the CONFIG.map grid and marker positions.
// Usage: node tools/sketch2map.mjs <sketch.png> [cols] [rows]
// Prints a JS snippet to paste into src/map.js (grid, plus marker positions as comments).
import { readPng } from './png.mjs';

const [, , file, colsArg, rowsArg] = process.argv;
const COLS = +colsArg || 120, ROWS = +rowsArg || 68;
const im = readPng(file);

const TERRAIN = {               // sketch color -> grid char
  '138,80,62': ':',             // dirt
  '48,156,99': '.',             // grass
  '104,113,122': '#',           // rock / mountain
  '180,214,69': 'T',            // trees / big plants
  '99,194,201': '~',            // river
  '181,128,87': '=',            // bridge
};
const MARKERS = {               // sketch color -> marker kind (the ground under a marker is dirt)
  '0,0,0': 'tower', '31,24,51': 'keep', '201,48,56': 'spawn', '184,253,255': 'camp',
  '255,255,255': null, '255,229,150': null,   // creep dots
};
const key = (x, y) => im.get(x, y).join(',');

// terrain: majority vote per tile
const grid = [];
for (let ty = 0; ty < ROWS; ty++) {
  let row = '';
  const y0 = Math.floor(ty * im.h / ROWS), y1 = Math.floor((ty + 1) * im.h / ROWS);
  for (let tx = 0; tx < COLS; tx++) {
    const x0 = Math.floor(tx * im.w / COLS), x1 = Math.floor((tx + 1) * im.w / COLS);
    const votes = {};
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const k = key(x, y), c = TERRAIN[k] || (k in MARKERS ? ':' : '.');
      votes[c] = (votes[c] || 0) + 1;
    }
    row += Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  }
  grid.push(row);
}

// markers: connected components -> centre (tiles) and size (tiles)
const seen = new Uint8Array(im.w * im.h), out = { tower: [], keep: [], spawn: [], camp: [] };
for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
  const kind = MARKERS[key(x, y)];
  if (!kind || seen[y * im.w + x]) continue;
  const k0 = key(x, y), stack = [[x, y]];
  let minX = x, maxX = x, minY = y, maxY = y;
  seen[y * im.w + x] = 1;
  while (stack.length) {
    const [cx, cy] = stack.pop();
    minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= im.w || ny >= im.h || seen[ny * im.w + nx] || key(nx, ny) !== k0) continue;
      seen[ny * im.w + nx] = 1; stack.push([nx, ny]);
    }
  }
  const r = (v) => Math.round(v * 2) / 2;
  out[kind].push({ x: r((minX + maxX + 1) / 2 * COLS / im.w), y: r((minY + maxY + 1) / 2 * ROWS / im.h) });
}
for (const k in out) out[k].sort((a, b) => a.y - b.y || a.x - b.x);

const j = (o) => JSON.stringify(o).replace(/"(\w+)":/g, '$1: ');
console.log('    grid: [');
for (const row of grid) console.log("      '" + row + "',");
console.log('    ],');
for (const k in out) console.log('    // ' + k + ': ' + out[k].map(j).join(', '));
