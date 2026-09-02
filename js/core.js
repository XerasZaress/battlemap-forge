/* Battlemap Forge — core: seeded RNG, noise, terrain materials, map model */
'use strict';

/* roundRect is used throughout the renderer; older Safari lacks it. */
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(Math.abs(typeof r === 'number' ? r : (r && r[0]) || 0), Math.abs(w) / 2, Math.abs(h) / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

/* ---------------- Seeded RNG ---------------- */

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class RNG {
  constructor(seed) {
    this.seedValue = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed));
    this._f = mulberry32(this.seedValue);
  }
  next() { return this._f(); }
  range(a, b) { return a + this._f() * (b - a); }
  int(a, b) { return Math.floor(a + this._f() * (b - a + 1)); }   // inclusive
  pick(arr) { return arr[Math.floor(this._f() * arr.length)]; }
  chance(p) { return this._f() < p; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this._f() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  gauss() {
    let u = 0, v = 0;
    while (u === 0) u = this._f();
    while (v === 0) v = this._f();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

/* ---------------- Value noise ---------------- */

function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, seed, oct = 4, lac = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise2(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= gain; freq *= lac;
  }
  return sum / norm;
}

/* ---------------- Terrain types ---------------- */

const T = {
  VOID: 0, STONE: 1, WOOD: 2, DIRT: 3, GRASS: 4, SAND: 5, SNOW: 6, MOSS: 7,
  COBBLE: 8, CARPET: 9, WATER: 10, DEEP: 11, LAVA: 12, CHASM: 13, ICE: 14,
  RUBBLE: 15, WALL: 16, WALL_WOOD: 17, ROCK: 18, MUD: 19, ASH: 20, BRIDGE: 21,
  SANDSTONE: 22, ROCK_ICE: 23, SKY: 24, CLOUD: 25
};

/* detail: how the full-res pass decorates the tile
   organic: base layer boundaries get noise-warped (natural edges)
   blocks:  true for wall-like tiles that get crisp architectural rendering */
const MATS = {};
function defMat(id, key, label, c1, c2, opts) {
  MATS[id] = Object.assign({
    id, key, label, c1, c2,
    detail: 'none', organic: false, blocks: false, wall: false, liquid: false, group: 'floor'
  }, opts || {});
}

defMat(T.VOID,      'void',   'Void / Empty',   [16, 16, 20],  [26, 26, 32],  { blocks: true, group: 'special' });
defMat(T.STONE,     'stone',  'Stone Floor',    [104, 99, 88], [136, 130, 118], { detail: 'flagstone' });
defMat(T.WOOD,      'wood',   'Wood Floor',     [106, 74, 43], [138, 98, 56], { detail: 'planks' });
defMat(T.DIRT,      'dirt',   'Dirt / Path',    [92, 70, 50],  [122, 92, 64], { detail: 'speckle', organic: true });
defMat(T.GRASS,     'grass',  'Grass',          [63, 107, 52], [92, 140, 66], { detail: 'grass', organic: true });
defMat(T.SAND,      'sand',   'Sand',           [194, 172, 116], [221, 201, 148], { detail: 'speckle', organic: true });
defMat(T.SNOW,      'snow',   'Snow',           [217, 226, 234], [243, 247, 250], { detail: 'speckle', organic: true });
defMat(T.MOSS,      'moss',   'Moss',           [74, 107, 58], [100, 138, 76], { detail: 'grass', organic: true });
defMat(T.COBBLE,    'cobble', 'Cobblestone',    [110, 106, 99], [139, 135, 128], { detail: 'cobble' });
defMat(T.CARPET,    'carpet', 'Carpet',         [122, 42, 42],  [156, 58, 55], { detail: 'weave' });
defMat(T.WATER,     'water',  'Shallow Water',  [47, 95, 115],  [63, 127, 149], { detail: 'water', organic: true, liquid: true });
defMat(T.DEEP,      'deep',   'Deep Water',     [20, 49, 63],   [29, 71, 90],  { detail: 'water', organic: true, liquid: true });
defMat(T.LAVA,      'lava',   'Lava',           [179, 45, 12],  [255, 150, 30], { detail: 'lava', organic: true, liquid: true, emissive: [255, 120, 40] });
defMat(T.CHASM,     'chasm',  'Chasm / Pit',    [10, 10, 13],   [30, 30, 38],  { detail: 'chasm', organic: true, group: 'special' });
defMat(T.ICE,       'ice',    'Ice',            [159, 198, 216], [207, 230, 240], { detail: 'ice', organic: true });
defMat(T.RUBBLE,    'rubble', 'Rubble',         [92, 87, 78],   [123, 117, 106], { detail: 'rubble', organic: true });
defMat(T.WALL,      'wall',   'Stone Wall',     [99, 95, 86],   [132, 126, 115], { detail: 'brick', blocks: true, wall: true, group: 'wall' });
defMat(T.WALL_WOOD, 'wallw',  'Wooden Wall',    [88, 61, 37],   [117, 84, 52], { detail: 'timber', blocks: true, wall: true, group: 'wall' });
defMat(T.ROCK,      'rock',   'Cave Rock',      [63, 59, 54],   [87, 82, 74],  { detail: 'rough', blocks: true, wall: true, group: 'wall' });
defMat(T.MUD,       'mud',    'Mud',            [74, 61, 42],   [99, 83, 58],  { detail: 'speckle', organic: true });
defMat(T.ASH,       'ash',    'Ash / Scorched', [58, 55, 51],   [85, 81, 76],  { detail: 'speckle', organic: true });
defMat(T.BRIDGE,    'bridge', 'Wooden Bridge',  [122, 86, 54],  [154, 111, 71], { detail: 'planks' });
defMat(T.SANDSTONE, 'sstone', 'Sandstone',      [146, 120, 84], [190, 162, 118], { detail: 'rough', blocks: true, wall: true, group: 'wall' });
defMat(T.ROCK_ICE,  'irock',  'Frozen Rock',    [88, 96, 108],  [128, 137, 150], { detail: 'rough', blocks: true, wall: true, group: 'wall' });
// open air, for aerial encounters — falling, not walking
defMat(T.SKY,       'sky',    'Open Sky',       [58, 96, 148],  [104, 154, 205], { detail: 'sky', organic: true, group: 'special' });
defMat(T.CLOUD,     'cloud',  'Cloud',          [176, 194, 214], [242, 246, 250], { detail: 'cloudy', organic: true, group: 'special' });

const MAT_BY_KEY = {};
for (const id in MATS) MAT_BY_KEY[MATS[id].key] = MATS[id];

function blocksSight(t) { return !!(MATS[t] && MATS[t].blocks); }
function isWallTile(t) { return !!(MATS[t] && MATS[t].wall); }

/* ---------------- Map model ---------------- */

/* Two kinds of barrier coexist:
   - solid terrain (cave rock, rubble-filled masonry) which fills whole cells,
     the right model for anything carved out of bedrock;
   - edge walls, thin partitions living on the line *between* two cells, the
     right model for built structures. A 5ft square should not be spent on a
     6-inch partition, and VTT line-of-sight wants the edge anyway. */
const EDGE = { NONE: 0, WALL: 1, DOOR: 2, SECRET: 3 };
const isEdgeDoor = (v) => v === EDGE.DOOR || v === EDGE.SECRET;

class GameMap {
  constructor(w, h, ppg) {
    this.w = w; this.h = h; this.ppg = ppg;
    this.cells = new Uint8Array(w * h);
    // horizontal edges: hw[y * w + x] is the edge above cell (x, y), y in 0..h
    this.hw = new Uint8Array(w * (h + 1));
    // vertical edges: vw[y * (w + 1) + x] is the edge left of cell (x, y), x in 0..w
    this.vw = new Uint8Array((w + 1) * h);
    this.props = [];          // {type, x, y, rot, scale, width}
    this.doors = [];          // legacy cell doors {x, y, dir:'h'|'v', secret, open}
    this.lights = [];         // {x, y, range, intensity, color}
    this.extraWalls = [];     // manual LOS segments in grid units [x1,y1,x2,y2]
    this.labels = [];         // text placed on the map; see labels.js
    this.placements = [];     // live prefab instances; see rooms.js
    this.layers = [];         // the draw stack, bottom first; see layers.js
    this.nextLid = 1;
    this.curLay = 0;          // layer new props land on; 0 means the default
    this.nextPid = 1;
    this.name = 'Untitled Map';
    this.theme = 'dungeon';
    this.seed = 'forge';
  }

  /* --- edge accessors. dir 'h' = the edge above (x, y); 'v' = left of (x, y) --- */
  hIn(x, y) { return x >= 0 && x < this.w && y >= 0 && y <= this.h; }
  vIn(x, y) { return x >= 0 && x <= this.w && y >= 0 && y < this.h; }
  getH(x, y) { return this.hIn(x, y) ? this.hw[y * this.w + x] : EDGE.NONE; }
  getV(x, y) { return this.vIn(x, y) ? this.vw[y * (this.w + 1) + x] : EDGE.NONE; }
  setH(x, y, v) { if (this.hIn(x, y)) this.hw[y * this.w + x] = v; }
  setV(x, y, v) { if (this.vIn(x, y)) this.vw[y * (this.w + 1) + x] = v; }
  getEdge(x, y, dir) { return dir === 'h' ? this.getH(x, y) : this.getV(x, y); }
  setEdge(x, y, dir, v) { dir === 'h' ? this.setH(x, y, v) : this.setV(x, y, v); }
  hasEdges() {
    for (let i = 0; i < this.hw.length; i++) if (this.hw[i]) return true;
    for (let i = 0; i < this.vw.length; i++) if (this.vw[i]) return true;
    return false;
  }
  /** Walls around the perimeter of a cell rectangle (inclusive bounds).
      Existing doorways survive, so butting a new room against an old one
      never bricks up the door they already share. */
  wallRect(x0, y0, x1, y1, v) {
    const put = (get, set, x, y) => {
      if (v === EDGE.WALL && isEdgeDoor(get.call(this, x, y))) return;
      set.call(this, x, y, v);
    };
    for (let x = x0; x <= x1; x++) {
      put(this.getH, this.setH, x, y0);
      put(this.getH, this.setH, x, y1 + 1);
    }
    for (let y = y0; y <= y1; y++) {
      put(this.getV, this.setV, x0, y);
      put(this.getV, this.setV, x1 + 1, y);
    }
  }
  /** Does an edge separate two cells that both count as open floor? */
  edgeIsInterior(x, y, dir, isOpenFn) {
    const a = dir === 'h' ? this.get(x, y - 1) : this.get(x - 1, y);
    const b = this.get(x, y);
    const inA = dir === 'h' ? (y - 1 >= 0) : (x - 1 >= 0);
    const inB = dir === 'h' ? (y < this.h) : (x < this.w);
    return inA && inB && isOpenFn(a) && isOpenFn(b);
  }
  idx(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inBounds(x, y) ? this.cells[y * this.w + x] : T.VOID; }
  set(x, y, t) { if (this.inBounds(x, y)) this.cells[y * this.w + x] = t; }
  fill(t) { this.cells.fill(t); }
  fillRect(x0, y0, x1, y1, t) {
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++)
        this.cells[y * this.w + x] = t;
  }
  strokeRect(x0, y0, x1, y1, t) {
    for (let x = x0; x <= x1; x++) { this.set(x, y0, t); this.set(x, y1, t); }
    for (let y = y0; y <= y1; y++) { this.set(x0, y, t); this.set(x1, y, t); }
  }
  countNeighbors(x, y, pred, radius = 1) {
    let n = 0;
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        n += pred(this.get(x + dx, y + dy)) ? 1 : 0;
      }
    return n;
  }
  /** rot: radians. scale: overall size. width: extra stretch across the prop's
      own x-axis, so a table can be made long without becoming fat. */
  addProp(type, x, y, opts) {
    const p = Object.assign({ type, x, y, rot: 0, scale: 1, width: 1, height: 1 }, opts || {});
    // One choke point for which layer a prop lands on, so the generators, the
    // prefab stamper, duplication and the Prop tool all obey the same setting
    // without each having to remember to.
    if (p.lay === undefined) p.lay = this.curLay || DEFAULT_PROP_LAYER;
    // A prop that draws itself with its seeded rng — rubble, foliage, a broken
    // barrel — must keep the same roll for life, or dragging it re-rolls its
    // shape under the cursor. Derived from the map seed and the order props
    // were added, so regenerating a seed reproduces the map exactly.
    if (p.sd === undefined) p.sd = hashString(String(this.seed) + ':' + this.props.length) & 0xffff;
    this.props.push(p);
  }
  clone() {
    const m = new GameMap(this.w, this.h, this.ppg);
    m.cells = this.cells.slice();
    m.hw = this.hw.slice();
    m.vw = this.vw.slice();
    m.props = JSON.parse(JSON.stringify(this.props));
    m.doors = JSON.parse(JSON.stringify(this.doors));
    m.lights = JSON.parse(JSON.stringify(this.lights));
    m.extraWalls = JSON.parse(JSON.stringify(this.extraWalls));
    m.labels = JSON.parse(JSON.stringify(this.labels));
    m.placements = JSON.parse(JSON.stringify(this.placements));
    m.layers = JSON.parse(JSON.stringify(this.layers));
    m.nextLid = this.nextLid; m.curLay = this.curLay;
    m.nextPid = this.nextPid;
    m.name = this.name; m.theme = this.theme; m.seed = this.seed;
    return m;
  }
  serialize() {
    return {
      v: 2, w: this.w, h: this.h, ppg: this.ppg, name: this.name, theme: this.theme, seed: this.seed,
      cells: Array.from(this.cells), hw: Array.from(this.hw), vw: Array.from(this.vw),
      props: this.props, doors: this.doors,
      lights: this.lights, extraWalls: this.extraWalls,
      // labels carry a cached text measurement; it is derived, so it never goes
      // in the file where a later font change could make it a lie
      labels: this.labels.map(l => {
        const o = {};
        for (const k in l) if (k.charAt(0) !== '_') o[k] = l[k];
        return o;
      }),
      placements: this.placements, nextPid: this.nextPid,
      layers: this.layers, nextLid: this.nextLid, curLay: this.curLay
    };
  }
  static deserialize(o) {
    const m = new GameMap(o.w, o.h, o.ppg);
    m.cells = Uint8Array.from(o.cells);
    // v1 projects predate edge walls and simply have none
    if (o.hw && o.hw.length === m.hw.length) m.hw = Uint8Array.from(o.hw);
    if (o.vw && o.vw.length === m.vw.length) m.vw = Uint8Array.from(o.vw);
    m.props = o.props || []; m.doors = o.doors || [];
    m.lights = o.lights || []; m.extraWalls = o.extraWalls || [];
    m.labels = o.labels || [];
    m.placements = o.placements || [];
    // v2 projects predate the stack; ensureLayers gives them the default one
    m.layers = o.layers || [];
    m.nextLid = o.nextLid || 0;
    m.curLay = o.curLay || 0;
    m.nextPid = o.nextPid || (m.placements.reduce((n, p) => Math.max(n, p.id), 0) + 1);
    m.name = o.name || 'Untitled Map'; m.theme = o.theme || 'dungeon'; m.seed = o.seed || 'forge';
    return m;
  }
}

/* ---------------- small helpers ---------------- */

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function rgb(c) { return `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`; }
function rgba(c, a) { return `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`; }
function mixRGB(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function shade(c, f) { return [clamp(c[0] * f, 0, 255), clamp(c[1] * f, 0, 255), clamp(c[2] * f, 0, 255)]; }
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
}
function rgbToHex(c) {
  return '#' + [c[0], c[1], c[2]].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
