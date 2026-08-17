/* Battlemap Forge — procedural generators */
'use strict';

const GENERATORS = {};
/* `knobs` names the sliders this generator actually reads, in the words that
   make sense for it. A knob left out is hidden in the UI rather than sitting
   there doing nothing. */
function defGen(key, label, group, gen, knobs) {
  GENERATORS[key] = { key, label, group, gen, knobs: knobs || {} };
}

/* ---------------- shared helpers ---------------- */

class Placer {
  constructor(map, rng) { this.map = map; this.rng = rng; this.occ = new Set(); }
  _k(x, y) { return x + ',' + y; }
  isFree(x, y, size) {
    const r = Math.max(0, Math.floor((size - 0.2) / 2));
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (this.occ.has(this._k(x + dx, y + dy))) return false;
    return true;
  }
  mark(x, y, size) {
    const r = Math.max(0, Math.floor((size - 0.2) / 2));
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) this.occ.add(this._k(x + dx, y + dy));
  }
  /** Place a prop at grid cell (x,y) if the terrain and space allow. */
  place(key, x, y, opts) {
    const def = PROPS[key]; if (!def) return false;
    if (!this.map.inBounds(x, y)) return false;
    if (!this.isFree(x, y, def.size)) return false;
    const o = Object.assign({}, opts);
    if (o.rot === undefined) o.rot = propRotation(def, this.rng);
    if (o.scale === undefined) o.scale = def.rand === false ? 1 : this.rng.range(def.snap ? 0.95 : 0.85, def.snap ? 1.05 : 1.12);
    this.map.addProp(key, x + 0.5, y + 0.5, o);
    this.mark(x, y, def.size);
    return true;
  }
  /** Scatter `count` props on cells passing `ok(t,x,y)`. */
  scatter(keys, count, ok, opts) {
    const m = this.map, tries = count * 40;
    let placed = 0;
    for (let i = 0; i < tries && placed < count; i++) {
      const x = this.rng.int(0, m.w - 1), y = this.rng.int(0, m.h - 1);
      if (!ok(m.get(x, y), x, y)) continue;
      if (this.place(this.rng.pick(keys), x, y, opts)) placed++;
    }
    return placed;
  }
}

/** Scale a prop count by the clutter knob. 0 leaves a room nearly bare,
    1 packs it; 0.5 reproduces the old default. */
function clutter(cfg, base) {
  return Math.max(0, Math.round(base * (0.1 + cfg.props * 1.8)));
}

const FLOORISH = new Set([T.STONE, T.WOOD, T.DIRT, T.GRASS, T.SAND, T.SNOW, T.MOSS, T.COBBLE, T.CARPET, T.RUBBLE, T.MUD, T.ASH, T.BRIDGE, T.ICE]);
const isOpen = (t) => FLOORISH.has(t);
const isWalkable = (t) => FLOORISH.has(t) || t === T.WATER;

function carveBlob(map, rng, cx, cy, r, t, jitter = 0.35) {
  const seed = rng.int(0, 99999);
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      if (!map.inBounds(x, y)) continue;
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const wob = (fbm(x * 0.28, y * 0.28, seed, 3) - 0.5) * 2 * jitter * r;
      if (d + wob <= r) map.set(x, y, t);
    }
}

/** Winding path from (x0,y0) to (x1,y1); calls cb(x,y) along a fattened line. */
function windingPath(map, rng, x0, y0, x1, y1, width, cb) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2.2) + 8;
  const seed = rng.int(0, 99999);
  const amp = Math.min(map.w, map.h) * 0.16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bx = lerp(x0, x1, t), by = lerp(y0, y1, t);
    const nx = (fbm(t * 3.1, 0.5, seed, 3) - 0.5) * 2 * amp * Math.sin(Math.PI * t);
    const ny = (fbm(0.5, t * 3.1, seed + 77, 3) - 0.5) * 2 * amp * Math.sin(Math.PI * t);
    const px = bx + nx, py = by + ny;
    const w = width * (0.8 + 0.4 * fbm(t * 5, 2, seed + 5, 2));
    const r = Math.ceil(w / 2) + 1;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const cx = Math.round(px) + dx, cy = Math.round(py) + dy;
        if (!map.inBounds(cx, cy)) continue;
        if (Math.hypot(cx + 0.5 - px, cy + 0.5 - py) <= w / 2) cb(cx, cy);
      }
  }
}

/** Keep only the largest 4-connected region of cells matching pred; others become `fillWith`. */
function keepLargestRegion(map, pred, fillWith) {
  const seen = new Uint8Array(map.w * map.h);
  let best = null, bestN = 0;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const i = map.idx(x, y);
    if (seen[i] || !pred(map.cells[i])) continue;
    const stack = [i]; seen[i] = 1; const region = [];
    while (stack.length) {
      const c = stack.pop(); region.push(c);
      const cx = c % map.w, cy = (c / map.w) | 0;
      const nb = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
      for (const [nx, ny] of nb) {
        if (!map.inBounds(nx, ny)) continue;
        const ni = map.idx(nx, ny);
        if (!seen[ni] && pred(map.cells[ni])) { seen[ni] = 1; stack.push(ni); }
      }
    }
    if (region.length > bestN) { bestN = region.length; best = region; }
  }
  if (!best) return;
  const keep = new Set(best);
  for (let i = 0; i < map.cells.length; i++)
    if (pred(map.cells[i]) && !keep.has(i)) map.cells[i] = fillWith;
}

/** Sprinkle secondary terrain using noise, only over cells currently `from`. */
function noiseSpeckle(map, rng, from, to, threshold, scale = 0.18) {
  const seed = rng.int(0, 99999);
  const fromSet = Array.isArray(from) ? new Set(from) : new Set([from]);
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (!fromSet.has(map.get(x, y))) continue;
    if (fbm(x * scale, y * scale, seed, 4) > threshold) map.set(x, y, to);
  }
}

/** Turn solid rock into wall tiles only where they touch open floor (keeps interiors solid). */
function outlineWalls(map, wallType, solidType) {
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (map.get(x, y) !== solidType) continue;
    let touch = false;
    for (let dy = -1; dy <= 1 && !touch; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (isOpen(map.get(x + dx, y + dy)) || map.get(x + dx, y + dy) === T.WATER) { touch = true; break; }
      }
    if (touch) map.set(x, y, wallType);
  }
}

function addDoor(map, x, y, dir, secret) {
  if (map.doors.some(d => d.x === x && d.y === y)) return;
  map.doors.push({ x, y, dir, secret: !!secret, open: false });
}

/** Drop doors that no longer bridge a gap in a wall, and correct their swing
    axis. Terrain edits after door placement (water pools, rubble, erosion) can
    leave a door hanging in the open, where it would seal nothing in a VTT. */
function validateDoors(map) {
  map.doors = map.doors.filter(d => {
    if (!map.inBounds(d.x, d.y) || !isOpen(map.get(d.x, d.y))) return false;
    const n = blocksSight(map.get(d.x, d.y - 1)), s = blocksSight(map.get(d.x, d.y + 1));
    const w = blocksSight(map.get(d.x - 1, d.y)), e = blocksSight(map.get(d.x + 1, d.y));
    const vertical = n && s, horizontal = w && e;
    if (vertical === horizontal) return false;   // open floor, or a dead corner
    d.dir = vertical ? 'v' : 'h';
    return true;
  });
}

/* ---------------- room-and-corridor dungeons ---------------- */

function genRooms(map, rng, cfg, opts) {
  const o = Object.assign({ minSize: 3, maxSize: 9, tries: 300, pad: 1 }, opts);
  const target = Math.round(clamp((map.w * map.h) / 90 * (0.25 + cfg.density * 1.9), 2, 30));
  const rooms = [];
  for (let i = 0; i < o.tries && rooms.length < target; i++) {
    const w = rng.int(o.minSize, o.maxSize), h = rng.int(o.minSize, o.maxSize);
    const x = rng.int(1, map.w - w - 2), y = rng.int(1, map.h - h - 2);
    const r = { x, y, w, h, x1: x + w - 1, y1: y + h - 1, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
    let clash = false;
    for (const q of rooms) {
      if (r.x - o.pad <= q.x1 + o.pad && r.x1 + o.pad >= q.x - o.pad &&
        r.y - o.pad <= q.y1 + o.pad && r.y1 + o.pad >= q.y - o.pad) { clash = true; break; }
    }
    if (!clash) rooms.push(r);
  }
  return rooms;
}

function connectRooms(map, rng, rooms, floorType, corridorW, loopiness) {
  const corridor = new Set();
  const carve = (x, y) => {
    const half = Math.floor(corridorW / 2);
    for (let dy = -half; dy <= corridorW - 1 - half; dy++)
      for (let dx = -half; dx <= corridorW - 1 - half; dx++) {
        if (!map.inBounds(x + dx, y + dy)) continue;
        if (x + dx < 1 || y + dy < 1 || x + dx > map.w - 2 || y + dy > map.h - 2) continue;
        map.set(x + dx, y + dy, floorType);
        corridor.add((y + dy) * map.w + (x + dx));
      }
  };
  const connected = [rooms[0]];
  const pending = rooms.slice(1);
  while (pending.length) {
    let bi = 0, bj = 0, bd = Infinity;
    for (let i = 0; i < connected.length; i++)
      for (let j = 0; j < pending.length; j++) {
        const d = Math.abs(connected[i].cx - pending[j].cx) + Math.abs(connected[i].cy - pending[j].cy);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    const a = connected[bi], b = pending[bj];
    if (rng.chance(0.5)) {
      for (let x = Math.min(a.cx, b.cx); x <= Math.max(a.cx, b.cx); x++) carve(x, a.cy);
      for (let y = Math.min(a.cy, b.cy); y <= Math.max(a.cy, b.cy); y++) carve(b.cx, y);
    } else {
      for (let y = Math.min(a.cy, b.cy); y <= Math.max(a.cy, b.cy); y++) carve(a.cx, y);
      for (let x = Math.min(a.cx, b.cx); x <= Math.max(a.cx, b.cx); x++) carve(x, b.cy);
    }
    connected.push(b); pending.splice(bj, 1);
  }
  // loops so the dungeon isn't a pure tree; how many is the complexity knob
  const extra = Math.round(rooms.length * (loopiness === undefined ? 0.25 : loopiness));
  for (let i = 0; i < extra; i++) {
    const a = rng.pick(rooms), b = rng.pick(rooms);
    if (a === b) continue;
    for (let x = Math.min(a.cx, b.cx); x <= Math.max(a.cx, b.cx); x++) carve(x, a.cy);
    for (let y = Math.min(a.cy, b.cy); y <= Math.max(a.cy, b.cy); y++) carve(b.cx, y);
  }
  return corridor;
}

function placeRoomDoors(map, rng, rooms, chance) {
  for (const r of rooms) {
    for (let x = r.x; x <= r.x1; x++) {
      if (isOpen(map.get(x, r.y - 1)) && rng.chance(chance)) addDoor(map, x, r.y - 1, 'h');
      if (isOpen(map.get(x, r.y1 + 1)) && rng.chance(chance)) addDoor(map, x, r.y1 + 1, 'h');
    }
    for (let y = r.y; y <= r.y1; y++) {
      if (isOpen(map.get(r.x - 1, y)) && rng.chance(chance)) addDoor(map, r.x - 1, y, 'v');
      if (isOpen(map.get(r.x1 + 1, y)) && rng.chance(chance)) addDoor(map, r.x1 + 1, y, 'v');
    }
  }
  validateDoors(map);
}

/* ================= DUNGEON ================= */

defGen('dungeon', 'Stone Dungeon', 'Interior', (map, rng, cfg) => {
  map.fill(T.ROCK);
  const rooms = genRooms(map, rng, cfg, { minSize: 3, maxSize: 3 + Math.round(cfg.complexity * 11) });
  if (!rooms.length) return;
  for (const r of rooms) map.fillRect(r.x, r.y, r.x1, r.y1, T.STONE);
  connectRooms(map, rng, rooms, T.STONE, rng.chance(cfg.complexity * 0.7) ? 2 : 1, cfg.complexity * 0.7);

  noiseSpeckle(map, rng, T.STONE, T.RUBBLE, 0.72, 0.3);
  if (cfg.water > 0.03) {
    const pools = Math.round(cfg.water * 10);
    for (let i = 0; i < pools; i++) {
      const r = rng.pick(rooms);
      carveBlob(map, rng, r.cx + rng.range(-2, 2), r.cy + rng.range(-2, 2),
        rng.range(1.2, 2 + cfg.water * 4), T.WATER);
    }
    if (cfg.water > 0.7) noiseSpeckle(map, rng, T.WATER, T.DEEP, 0.62, 0.25);
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++)
      if (map.get(x, y) === T.WATER && !isOpen(map.get(x, y - 1)) && !isOpen(map.get(x, y + 1)) &&
        !isOpen(map.get(x - 1, y)) && !isOpen(map.get(x + 1, y))) map.set(x, y, T.STONE);
  }
  outlineWalls(map, T.WALL, T.ROCK);
  placeRoomDoors(map, rng, rooms, 0.75);

  const p = new Placer(map, rng);
  const big = rooms.filter(r => r.w >= 6 && r.h >= 6);
  for (const r of big) {
    if (rng.chance(0.45)) {
      for (const [px, py] of [[r.x + 1, r.y + 1], [r.x1 - 1, r.y + 1], [r.x + 1, r.y1 - 1], [r.x1 - 1, r.y1 - 1]])
        p.place('pillar', px, py);
    }
    if (rng.chance(0.3)) p.place('rug', r.cx, r.cy);
  }
  const feature = rng.pick(['altar', 'statue', 'fountain', 'well', 'throne']);
  if (rooms.length) { const r = rng.pick(big.length ? big : rooms); p.place(feature, r.cx, r.cy); }

  const n = clutter(cfg, rooms.length * 3);
  p.scatter(['barrel', 'crate', 'chest', 'sack', 'pot', 'crates_stack', 'bookshelf', 'table_long', 'table_round', 'chair', 'weapon_rack', 'anvil', 'cage', 'bed'],
    n, t => t === T.STONE);
  p.scatter(['bones', 'skull', 'rubble_pile', 'spiderweb', 'mushroom'], Math.round(n * 0.7), t => t === T.STONE || t === T.RUBBLE);
  p.scatter(['brazier', 'torch'], clutter(cfg, 7), (t, x, y) =>
    t === T.STONE && (isWallTile(map.get(x - 1, y)) || isWallTile(map.get(x + 1, y)) || isWallTile(map.get(x, y - 1)) || isWallTile(map.get(x, y + 1))));
  p.place('stairs_up', rooms[0].cx, rooms[0].cy);
}, { density: 'Rooms', complexity: 'Room size & loops', water: 'Flooding', props: 'Clutter' });

/* ================= CRYPT ================= */

defGen('crypt', 'Crypt / Catacombs', 'Interior', (map, rng, cfg) => {
  map.fill(T.ROCK);
  const rooms = genRooms(map, rng, cfg, { minSize: 3, maxSize: 3 + Math.round(cfg.complexity * 9) });
  if (!rooms.length) return;
  for (const r of rooms) map.fillRect(r.x, r.y, r.x1, r.y1, T.STONE);
  connectRooms(map, rng, rooms, T.STONE, 1, cfg.complexity * 0.5);
  placeRoomDoors(map, rng, rooms, 0.5);
  noiseSpeckle(map, rng, T.STONE, T.RUBBLE, 0.68, 0.32);
  // groundwater seeping into the lower chambers
  if (cfg.water > 0.05) {
    const seed = rng.int(0, 99999);
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      if (map.get(x, y) !== T.STONE) continue;
      if (fbm(x * 0.13, y * 0.13, seed, 4) < 0.2 + cfg.water * 0.3) map.set(x, y, T.WATER);
    }
  }
  noiseSpeckle(map, rng, T.STONE, T.MOSS, 0.78, 0.22);
  outlineWalls(map, T.WALL, T.ROCK);

  const p = new Placer(map, rng);
  for (const r of rooms) {
    if (r.w >= 5 && r.h >= 5 && rng.chance(0.7)) {
      const cols = Math.max(1, Math.floor(r.w / 3)), rows = Math.max(1, Math.floor(r.h / 4));
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++)
        p.place(rng.chance(0.6) ? 'sarcophagus' : 'coffin', r.x + 1 + i * 3, r.y + 1 + j * 4, { rot: 0 });
    }
  }
  const n = clutter(cfg, rooms.length * 2.5);
  p.scatter(['gravestone', 'skull', 'bones', 'spiderweb', 'rubble_pile', 'pot', 'chest'], n * 2, t => t === T.STONE || t === T.RUBBLE || t === T.MOSS);
  p.scatter(['candles', 'brazier'], clutter(cfg, 5.5), t => t === T.STONE);
  p.place('altar', rooms[rooms.length - 1].cx, rooms[rooms.length - 1].cy);
}, { density: 'Chambers', complexity: 'Chamber size', water: 'Seepage', props: 'Grave goods' });

/* ================= CAVERN ================= */

defGen('cavern', 'Natural Cavern', 'Underground', (map, rng, cfg) => {
  const fillP = 0.58 - cfg.density * 0.26;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const edge = x < 2 || y < 2 || x > map.w - 3 || y > map.h - 3;
    map.set(x, y, edge || rng.chance(fillP) ? T.ROCK : T.STONE);
  }
  const steps = 4 + Math.round(cfg.complexity * 3);
  for (let s = 0; s < steps; s++) {
    const next = map.cells.slice();
    for (let y = 1; y < map.h - 1; y++) for (let x = 1; x < map.w - 1; x++) {
      const walls = map.countNeighbors(x, y, t => t === T.ROCK);
      const i = map.idx(x, y);
      next[i] = walls > 4 ? T.ROCK : walls < 4 ? T.STONE : map.cells[i];
    }
    map.cells = next;
  }
  // complexity opens extra chambers and links them, turning a single blob
  // into a proper warren
  const chambers = Math.round(cfg.complexity * 7);
  for (let i = 0; i < chambers; i++) {
    const cx = rng.int(4, map.w - 5), cy = rng.int(4, map.h - 5);
    carveBlob(map, rng, cx, cy, rng.range(1.6, 2 + cfg.complexity * 3.5), T.STONE, 0.5);
    if (i > 0 && rng.chance(0.7)) {
      const bx = rng.int(4, map.w - 5), by = rng.int(4, map.h - 5);
      windingPath(map, rng, cx, cy, bx, by, 1 + cfg.complexity * 1.6,
        (x, y) => { if (x > 1 && y > 1 && x < map.w - 2 && y < map.h - 2) map.set(x, y, T.STONE); });
    }
  }
  keepLargestRegion(map, t => t === T.STONE, T.ROCK);

  noiseSpeckle(map, rng, T.STONE, T.DIRT, 0.55, 0.14);
  noiseSpeckle(map, rng, [T.STONE, T.DIRT], T.MOSS, 0.68, 0.2);
  if (cfg.water > 0.05) {
    const seed = rng.int(0, 99999);
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      if (!isOpen(map.get(x, y))) continue;
      const v = fbm(x * 0.11, y * 0.11, seed, 4);
      if (v < 0.34 - (0.5 - cfg.water) * 0.15) map.set(x, y, v < 0.27 ? T.DEEP : T.WATER);
    }
  }
  if (cfg.lava > 0.05) {
    const seed = rng.int(0, 99999);
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      if (!isOpen(map.get(x, y))) continue;
      if (fbm(x * 0.1 + 50, y * 0.1, seed, 3) > 0.72 - cfg.lava * 0.1) map.set(x, y, T.LAVA);
    }
  }

  const p = new Placer(map, rng);
  const near = (x, y) => isWallTile(map.get(x - 1, y)) || isWallTile(map.get(x + 1, y)) || isWallTile(map.get(x, y - 1)) || isWallTile(map.get(x, y + 1));
  const n = clutter(cfg, map.w * map.h * 0.0144);
  p.scatter(['stalagmite', 'rock', 'rock_small'], n, (t, x, y) => isOpen(t) && near(x, y));
  p.scatter(['rock_small', 'mushroom', 'bones', 'rubble_pile', 'skull'], n, t => isOpen(t));
  p.scatter(['mushroom_glow', 'crystal'], clutter(cfg, 7), t => isOpen(t));
  p.scatter(['campfire', 'crate', 'barrel', 'tent'], clutter(cfg, 3), t => t === T.STONE || t === T.DIRT);
}, { density: 'Open space', complexity: 'Chambers & passages', water: 'Pools', lava: 'Lava', props: 'Formations' });

/* ================= SEWER ================= */

defGen('sewer', 'Sewer Tunnels', 'Underground', (map, rng, cfg) => {
  map.fill(T.ROCK);
  const lines = [];
  const nH = 1 + Math.round(cfg.complexity * 2), nV = 1 + Math.round(cfg.complexity * 2);
  for (let i = 0; i < nH; i++) lines.push({ h: true, at: Math.round((map.h * (i + 1)) / (nH + 1)) + rng.int(-2, 2) });
  for (let i = 0; i < nV; i++) lines.push({ h: false, at: Math.round((map.w * (i + 1)) / (nV + 1)) + rng.int(-2, 2) });

  for (const L of lines) {
    const half = 2 + Math.round(cfg.water * 2);   // wider sluices when wetter
    if (L.h) {
      for (let x = 1; x < map.w - 1; x++)
        for (let d = -half; d <= half; d++) map.set(x, L.at + d, Math.abs(d) <= (half - 2) ? T.WATER : T.STONE);
    } else {
      for (let y = 1; y < map.h - 1; y++)
        for (let d = -half; d <= half; d++) map.set(L.at + d, y, Math.abs(d) <= (half - 2) ? T.WATER : T.STONE);
    }
  }
  // junction chambers
  for (let i = 0; i < 1 + Math.round(cfg.density * 7); i++) {
    const cx = rng.int(5, map.w - 6), cy = rng.int(5, map.h - 6);
    const w = rng.int(4, 5 + Math.round(cfg.density * 6)), h = rng.int(4, 5 + Math.round(cfg.density * 5));
    map.fillRect(cx - (w >> 1), cy - (h >> 1), cx + (w >> 1), cy + (h >> 1), T.STONE);
  }
  keepLargestRegion(map, t => t !== T.ROCK, T.ROCK);
  noiseSpeckle(map, rng, T.STONE, T.MOSS, 0.66, 0.24);
  noiseSpeckle(map, rng, T.STONE, T.RUBBLE, 0.74, 0.3);
  outlineWalls(map, T.WALL, T.ROCK);

  const p = new Placer(map, rng);
  const n = clutter(cfg, map.w * map.h * 0.0096);
  p.scatter(['barrel', 'crate', 'sack', 'bones', 'skull', 'rubble_pile', 'mushroom', 'pot'], n, t => t === T.STONE || t === T.MOSS);
  p.scatter(['mushroom_glow', 'lantern', 'torch'], clutter(cfg, 5), t => t === T.STONE);
  p.scatter(['ladder'], 2, t => t === T.STONE);
}, { density: 'Junction chambers', complexity: 'Tunnels', water: 'Channel width', props: 'Debris' });

/* ================= TAVERN / BUILDING INTERIOR ================= */

defGen('tavern', 'Tavern / Interior', 'Interior', (map, rng, cfg) => {
  map.fill(T.VOID);
  const m = 1;
  const x0 = m, y0 = m, x1 = map.w - 1 - m, y1 = map.h - 1 - m;
  // Floor runs wall-to-wall; the walls themselves live on the edges, so no
  // interior square is lost to a partition.
  map.fillRect(x0, y0, x1, y1, T.WOOD);
  map.wallRect(x0, y0, x1, y1, EDGE.WALL);

  // interior partitions: split off 1-3 back rooms
  const rooms = [];
  const nRooms = Math.round(cfg.complexity * 5);
  for (let i = 0; i < nRooms * 4 && rooms.length < nRooms; i++) {
    const rw = rng.int(4, clamp(Math.floor((x1 - x0) * 0.4), 5, 9));
    const rh = rng.int(4, clamp(Math.floor((y1 - y0) * 0.45), 5, 9));
    const corner = rng.int(0, 3);
    const rx = corner % 2 === 0 ? x0 + 1 : x1 - rw;
    const ry = corner < 2 ? y0 + 1 : y1 - rh;
    const r = { x: rx, y: ry, x1: rx + rw - 1, y1: ry + rh - 1, cx: rx + (rw >> 1), cy: ry + (rh >> 1), w: rw, h: rh };
    if (r.x < x0 + 1 || r.y < y0 + 1 || r.x1 > x1 - 1 || r.y1 > y1 - 1) continue;
    if (rooms.some(q => r.x <= q.x1 + 1 && r.x1 >= q.x - 1 && r.y <= q.y1 + 1 && r.y1 >= q.y - 1)) continue;
    map.wallRect(r.x, r.y, r.x1, r.y1, EDGE.WALL);
    // cut a doorway through one of its partitions
    const side = rng.int(0, 3);
    if (side === 0) map.setH(rng.int(r.x, r.x1), r.y, EDGE.DOOR);
    else if (side === 1) map.setH(rng.int(r.x, r.x1), r.y1 + 1, EDGE.DOOR);
    else if (side === 2) map.setV(r.x, rng.int(r.y, r.y1), EDGE.DOOR);
    else map.setV(r.x1 + 1, rng.int(r.y, r.y1), EDGE.DOOR);
    rooms.push(r);
  }

  // front door on an outer wall
  map.setH(rng.int(x0 + 2, x1 - 2), y1 + 1, EDGE.DOOR);
  if (rng.chance(0.6)) map.setV(x0, rng.int(y0 + 2, y1 - 2), EDGE.DOOR);

  const inRoom = (x, y) => rooms.some(r => x >= r.x && x <= r.x1 && y >= r.y && y <= r.y1);
  const p = new Placer(map, rng);

  // bar counter along a wall in the main hall
  for (let tryI = 0; tryI < 30; tryI++) {
    const bx = rng.int(x0 + 3, x1 - 3), by = rng.int(y0 + 2, y1 - 2);
    if (inRoom(bx, by) || map.get(bx, by) !== T.WOOD) continue;
    if (p.place('bar_counter', bx, by, { rot: rng.chance(0.5) ? 0 : Math.PI / 2 })) break;
  }
  // hearth against a wall
  for (let tryI = 0; tryI < 30; tryI++) {
    const hx = rng.int(x0 + 2, x1 - 2), hy = y0 + 1;
    if (!inRoom(hx, hy) && map.get(hx, hy) === T.WOOD && p.place('fireplace', hx, hy, { rot: 0 })) break;
  }
  // table clusters — leave room to walk between them
  const wantTables = Math.max(1, Math.round((1 + cfg.density * 11) * (0.4 + cfg.props * 1.2)));
  let seated = 0;
  for (let i = 0; i < wantTables * 25 && seated < wantTables; i++) {
    const tx = rng.int(x0 + 2, x1 - 2), ty = rng.int(y0 + 2, y1 - 2);
    if (inRoom(tx, ty) || map.get(tx, ty) !== T.WOOD) continue;
    const kind = rng.chance(0.55) ? 'table_round' : 'table_long';
    if (!p.place(kind, tx, ty)) continue;
    seated++;
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
      if (rng.chance(0.5)) p.place(rng.chance(0.5) ? 'chair' : 'stool', tx + ox, ty + oy);
    if (rng.chance(0.4)) p.place('candles', tx, ty);
  }
  p.scatter(['barrel', 'keg', 'crate', 'sack', 'crates_stack', 'bed', 'bookshelf', 'desk', 'chest', 'cauldron'],
    clutter(cfg, 8), (t, x, y) => t === T.WOOD);
  p.scatter(['rug'], 2, (t, x, y) => t === T.WOOD && !inRoom(x, y));
  p.scatter(['lantern', 'candles'], clutter(cfg, 7), t => t === T.WOOD);
  p.scatter(['stairs_up'], 1, (t, x, y) => t === T.WOOD && !inRoom(x, y));
}, { density: 'Seating', complexity: 'Back rooms', props: 'Clutter' });

/* ================= TOWN ================= */

defGen('town', 'Town / Village', 'Settlement', (map, rng, cfg) => {
  map.fill(T.GRASS);
  noiseSpeckle(map, rng, T.GRASS, T.DIRT, 0.58, 0.14);

  // road network
  // Road count scales with the map, so a small village doesn't end up as all street.
  const roads = [];
  const nH = clamp(Math.round((map.h / 15) * (0.7 + cfg.complexity)), 1, 3);
  const nV = clamp(Math.round((map.w / 15) * (0.7 + cfg.complexity)), 1, 3);
  for (let i = 0; i < nH; i++) roads.push({ h: true, at: Math.round((map.h * (i + 1)) / (nH + 1)) + rng.int(-2, 2) });
  for (let i = 0; i < nV; i++) roads.push({ h: false, at: Math.round((map.w * (i + 1)) / (nV + 1)) + rng.int(-2, 2) });
  for (const r of roads) {
    const half = rng.chance(0.7) ? 1 : 2;
    if (r.h) for (let x = 0; x < map.w; x++) for (let d = -half; d <= half; d++) map.set(x, r.at + d, T.COBBLE);
    else for (let y = 0; y < map.h; y++) for (let d = -half; d <= half; d++) map.set(r.at + d, y, T.COBBLE);
  }

  // a river cutting through the settlement
  if (cfg.water > 0.15) {
    const horiz = rng.chance(0.5);
    const a = horiz ? [0, rng.int(3, map.h - 4)] : [rng.int(3, map.w - 4), 0];
    const b = horiz ? [map.w - 1, rng.int(3, map.h - 4)] : [rng.int(3, map.w - 4), map.h - 1];
    windingPath(map, rng, a[0], a[1], b[0], b[1], 1 + cfg.water * 4,
      (x, y) => map.set(x, y, T.WATER));
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++)
      if (map.get(x, y) !== T.WATER && map.countNeighbors(x, y, t => t === T.WATER) > 3)
        map.set(x, y, T.MUD);
  }

  const onRoad = (x, y) => map.get(x, y) === T.COBBLE;
  const buildings = [];
  const target = Math.round((map.w * map.h) / 110 * (0.2 + cfg.density * 2.2));
  for (let i = 0; i < 900 && buildings.length < target; i++) {
    const w = rng.int(3, 7), h = rng.int(3, 6);
    const x = rng.int(1, map.w - w - 2), y = rng.int(1, map.h - h - 2);
    const b = { x, y, x1: x + w - 1, y1: y + h - 1, w, h, cx: x + (w >> 1), cy: y + (h >> 1) };
    // Buildings may front directly onto the street, but must not sit on it.
    let bad = false;
    for (let yy = b.y; yy <= b.y1 && !bad; yy++)
      for (let xx = b.x; xx <= b.x1; xx++)
        if (onRoad(xx, yy) || map.get(xx, yy) === T.WATER) { bad = true; break; }
    if (!bad) for (const q of buildings)
      if (b.x - 1 <= q.x1 && b.x1 + 1 >= q.x && b.y - 1 <= q.y1 && b.y1 + 1 >= q.y) { bad = true; break; }
    if (bad) continue;
    map.fillRect(b.x, b.y, b.x1, b.y1, T.WOOD);
    map.wallRect(b.x, b.y, b.x1, b.y1, EDGE.WALL);
    buildings.push(b);
  }

  // front door on whichever wall faces the nearest street
  for (const b of buildings) {
    const cands = [];
    for (let x = b.x; x <= b.x1; x++) {
      cands.push({ ex: x, ey: b.y, dir: 'h', out: [x, b.y - 1] });
      cands.push({ ex: x, ey: b.y1 + 1, dir: 'h', out: [x, b.y1 + 1] });
    }
    for (let y = b.y; y <= b.y1; y++) {
      cands.push({ ex: b.x, ey: y, dir: 'v', out: [b.x - 1, y] });
      cands.push({ ex: b.x1 + 1, ey: y, dir: 'v', out: [b.x1 + 1, y] });
    }
    rng.shuffle(cands);
    let best = null, bestD = Infinity;
    for (const c of cands) {
      const [sx, sy] = c.out;
      const stepX = sx < b.x ? -1 : sx > b.x1 ? 1 : 0;
      const stepY = sy < b.y ? -1 : sy > b.y1 ? 1 : 0;
      for (let d = 0; d <= 6; d++) {
        if (onRoad(sx + stepX * d, sy + stepY * d) && d < bestD) { bestD = d; best = c; break; }
      }
    }
    const pick = best || cands[0];
    if (pick) map.setEdge(pick.ex, pick.ey, pick.dir, EDGE.DOOR);
  }

  const p = new Placer(map, rng);
  const inside = (x, y) => buildings.some(b => x >= b.x && x <= b.x1 && y >= b.y && y <= b.y1);
  for (const b of buildings) {
    p.scatter(['table_round', 'chair', 'bed', 'chest', 'barrel', 'bookshelf', 'desk', 'stool'],
      clutter(cfg, 4),
      (t, x, y) => t === T.WOOD && x >= b.x && x <= b.x1 && y >= b.y && y <= b.y1);
  }
  if (buildings.length) {
    const plaza = rng.pick(buildings);
    p.place(rng.chance(0.5) ? 'well' : 'fountain', plaza.cx, clamp(plaza.y1 + 3, 1, map.h - 2));
  }
  p.scatter(['market_stall', 'cart', 'crates_stack', 'barrel', 'tent'], clutter(cfg, 6),
    (t, x, y) => (t === T.GRASS || t === T.DIRT) && !inside(x, y));
  p.scatter(['tree_oak', 'tree_pine', 'bush', 'flowers', 'rock_small', 'stump'], clutter(cfg, 13),
    (t, x, y) => (t === T.GRASS || t === T.DIRT) && !inside(x, y));
  p.scatter(['lantern', 'campfire'], clutter(cfg, 4.5), (t, x, y) => t === T.COBBLE || t === T.DIRT);
}, { density: 'Buildings', complexity: 'Streets', water: 'River', props: 'Street clutter' });

/* ================= RUINS ================= */

defGen('ruins', 'Overgrown Ruins', 'Wilderness', (map, rng, cfg) => {
  map.fill(T.GRASS);
  noiseSpeckle(map, rng, T.GRASS, T.MOSS, 0.5, 0.12);
  noiseSpeckle(map, rng, [T.GRASS, T.MOSS], T.DIRT, 0.68, 0.2);

  const rooms = genRooms(map, rng, cfg, { minSize: 4, maxSize: 5 + Math.round(cfg.complexity * 7), pad: 2 });
  for (const r of rooms) {
    map.fillRect(r.x, r.y, r.x1, r.y1, rng.chance(0.7) ? T.STONE : T.RUBBLE);
    // broken walls: stroke with random gaps
    // complexity = how much masonry is still standing
    const intact = 0.25 + cfg.complexity * 0.7;
    for (let x = r.x; x <= r.x1; x++) {
      if (rng.chance(intact)) map.set(x, r.y, T.WALL);
      if (rng.chance(intact)) map.set(x, r.y1, T.WALL);
    }
    for (let y = r.y; y <= r.y1; y++) {
      if (rng.chance(intact)) map.set(r.x, y, T.WALL);
      if (rng.chance(intact)) map.set(r.x1, y, T.WALL);
    }
  }
  noiseSpeckle(map, rng, T.STONE, T.RUBBLE, 0.62, 0.28);
  noiseSpeckle(map, rng, T.STONE, T.MOSS, 0.76, 0.2);
  for (let i = 0; i < Math.round(cfg.water * 4); i++) {
    const cx = rng.int(4, map.w - 5), cy = rng.int(4, map.h - 5);
    carveBlob(map, rng, cx, cy, rng.range(1.6, 2 + cfg.water * 4), T.WATER, 0.5);
  }

  const p = new Placer(map, rng);
  p.scatter(['pillar_broken', 'rubble_pile', 'statue', 'gravestone'], clutter(cfg, 13),
    t => t === T.STONE || t === T.RUBBLE || t === T.MOSS);
  p.scatter(['tree_oak', 'tree_dead', 'bush', 'flowers', 'rock', 'rock_small', 'log', 'stump'],
    clutter(cfg, 17), t => t === T.GRASS || t === T.MOSS || t === T.DIRT);
  p.scatter(['bones', 'skull', 'chest', 'campfire', 'altar'], clutter(cfg, 6), t => isOpen(t));
}, { density: 'Ruined buildings', complexity: 'Masonry still standing', water: 'Ponds', props: 'Debris & overgrowth' });

/* ================= FOREST ================= */

defGen('forest', 'Forest Clearing', 'Wilderness', (map, rng, cfg) => {
  map.fill(T.GRASS);
  noiseSpeckle(map, rng, T.GRASS, T.MOSS, 0.52, 0.13);
  noiseSpeckle(map, rng, [T.GRASS, T.MOSS], T.DIRT, 0.72, 0.22);

  // trails — complexity decides how criss-crossed the wood is
  const trails = Math.round(cfg.complexity * 4);
  for (let i = 0; i < trails; i++) {
    const horiz = rng.chance(0.5);
    const a = horiz ? [0, rng.int(3, map.h - 4)] : [rng.int(3, map.w - 4), 0];
    const b = horiz ? [map.w - 1, rng.int(3, map.h - 4)] : [rng.int(3, map.w - 4), map.h - 1];
    windingPath(map, rng, a[0], a[1], b[0], b[1], rng.range(1.4, 2.6), (x, y) => map.set(x, y, T.DIRT));
  }
  // stream
  if (cfg.water > 0.1) {
    const horiz = rng.chance(0.5);
    const a = horiz ? [0, rng.int(2, map.h - 3)] : [rng.int(2, map.w - 3), 0];
    const b = horiz ? [map.w - 1, rng.int(2, map.h - 3)] : [rng.int(2, map.w - 3), map.h - 1];
    windingPath(map, rng, a[0], a[1], b[0], b[1], 1.4 + cfg.water * 3, (x, y) => map.set(x, y, T.WATER));
    // bank mud
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++)
      if (map.get(x, y) !== T.WATER && map.countNeighbors(x, y, t => t === T.WATER) > 2 && rng.chance(0.6))
        map.set(x, y, T.MUD);
  }
  // clearing
  const clx = rng.int(6, map.w - 7), cly = rng.int(6, map.h - 7);
  const clr = rng.range(2.5, 4.5);
  // extra glades so a dense wood still has somewhere to fight
  for (let i = 0; i < Math.round(cfg.complexity * 3); i++)
    carveBlob(map, rng, rng.int(4, map.w - 5), rng.int(4, map.h - 5), rng.range(2, 3.5), T.GRASS, 0.5);

  const p = new Placer(map, rng);
  const density = 0.25 + cfg.density * 2.1;
  const seed = rng.int(0, 99999);
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const t = map.get(x, y);
    if (t !== T.GRASS && t !== T.MOSS) continue;
    if (Math.hypot(x - clx, y - cly) < clr) continue;
    const v = fbm(x * 0.16, y * 0.16, seed, 3);
    if (v * density > 0.62 && rng.chance(0.35 + cfg.density * 0.5))
      p.place(rng.chance(0.55) ? 'tree_oak' : rng.chance(0.7) ? 'tree_pine' : 'tree_dead', x, y);
  }
  p.scatter(['bush', 'flowers', 'rock', 'rock_small', 'log', 'stump', 'mushroom'],
    clutter(cfg, 23), t => t === T.GRASS || t === T.MOSS || t === T.DIRT);
  p.place('campfire', clx, cly);
  p.scatter(['tent', 'log', 'crate'], clutter(cfg, 2.5),
    (t, x, y) => Math.hypot(x - clx, y - cly) < clr + 1.5 && isOpen(t));
  p.scatter(['reeds', 'lilypad'], clutter(cfg, 4), t => t === T.WATER || t === T.MUD);
}, { density: 'Tree cover', complexity: 'Trails & glades', water: 'Stream', props: 'Undergrowth' });

/* ================= SWAMP ================= */

defGen('swamp', 'Swamp / Marsh', 'Wilderness', (map, rng, cfg) => {
  const seed = rng.int(0, 99999);
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const v = fbm(x * 0.11, y * 0.11, seed, 5);
    const w = 0.44 + (0.5 - cfg.water) * 0.2;
    map.set(x, y, v < w - 0.09 ? T.DEEP : v < w ? T.WATER : v < w + 0.08 ? T.MUD : T.GRASS);
  }
  noiseSpeckle(map, rng, T.GRASS, T.MOSS, 0.55, 0.16);

  // dry hummocks to stand on — density decides how much solid ground there is
  for (let i = 0; i < Math.round(cfg.density * 9); i++)
    carveBlob(map, rng, rng.int(2, map.w - 3), rng.int(2, map.h - 3),
      rng.range(1.2, 1.6 + cfg.density * 2.6), T.GRASS, 0.55);

  // plank walkways — complexity decides how developed the crossing is
  const walks = Math.round(cfg.complexity * 3.4);
  for (let i = 0; i < walks; i++) {
    const horiz = rng.chance(0.5);
    const a = horiz ? [0, rng.int(3, map.h - 4)] : [rng.int(3, map.w - 4), 0];
    const b = horiz ? [map.w - 1, rng.int(3, map.h - 4)] : [rng.int(3, map.w - 4), map.h - 1];
    windingPath(map, rng, a[0], a[1], b[0], b[1], 1.4, (x, y) => map.set(x, y, T.BRIDGE));
  }

  const p = new Placer(map, rng);
  p.scatter(['tree_dead', 'stump', 'log'], clutter(cfg, 21), t => t === T.MUD || t === T.GRASS || t === T.MOSS);
  p.scatter(['reeds', 'lilypad'], clutter(cfg, 25), t => t === T.WATER || t === T.MUD);
  p.scatter(['bush', 'mushroom', 'rock_small', 'bones', 'skull'], clutter(cfg, 13), t => isOpen(t));
  p.scatter(['mushroom_glow'], clutter(cfg, 5), t => isOpen(t));
  p.scatter(['boat'], rng.chance(0.6) ? 1 : 0, t => t === T.WATER || t === T.DEEP);
  p.scatter(['tent', 'campfire'], 1, t => t === T.GRASS);
}, { density: 'Dry ground', complexity: 'Walkways', water: 'Water level', props: 'Vegetation' });

/* ================= DESERT ================= */

defGen('desert', 'Desert / Dunes', 'Wilderness', (map, rng, cfg) => {
  map.fill(T.SAND);
  noiseSpeckle(map, rng, T.SAND, T.DIRT, 0.62, 0.1);
  const outcrops = Math.round(2 + cfg.density * 5);
  for (let i = 0; i < outcrops; i++)
    carveBlob(map, rng, rng.int(3, map.w - 4), rng.int(3, map.h - 4), rng.range(1.2, 3), T.SANDSTONE, 0.55);

  // buried ruin
  if (cfg.complexity > 0.08) {
    const rooms = genRooms(map, rng, { density: cfg.complexity, complexity: cfg.complexity },
      { minSize: 4, maxSize: 5 + Math.round(cfg.complexity * 7), pad: 2 });
    for (const r of rooms.slice(0, 1 + Math.round(cfg.complexity * 6))) {
      map.fillRect(r.x, r.y, r.x1, r.y1, T.STONE);
      for (let x = r.x; x <= r.x1; x++) { if (rng.chance(0.6)) map.set(x, r.y, T.WALL); if (rng.chance(0.6)) map.set(x, r.y1, T.WALL); }
      for (let y = r.y; y <= r.y1; y++) { if (rng.chance(0.6)) map.set(r.x, y, T.WALL); if (rng.chance(0.6)) map.set(r.x1, y, T.WALL); }
      noiseSpeckle(map, rng, T.STONE, T.SAND, 0.6, 0.3);
    }
  }
  if (cfg.water > 0.15) {
    const cx = rng.int(5, map.w - 6), cy = rng.int(5, map.h - 6);
    carveBlob(map, rng, cx, cy, rng.range(1.8, 3.5), T.WATER, 0.4);
    carveBlob(map, rng, cx, cy, rng.range(0.8, 1.6), T.DEEP, 0.4);
    for (let i = 0; i < 6; i++) {
      const a = rng.range(0, Math.PI * 2), d = rng.range(3, 5);
      const px = Math.round(cx + Math.cos(a) * d), py = Math.round(cy + Math.sin(a) * d);
      if (map.inBounds(px, py) && map.get(px, py) === T.SAND) map.set(px, py, T.GRASS);
    }
  }

  const p = new Placer(map, rng);
  p.scatter(['rock', 'rock_small', 'bones', 'skull', 'cactus', 'pillar_broken', 'rubble_pile'],
    clutter(cfg, 18), t => t === T.SAND || t === T.DIRT || t === T.STONE || t === T.SANDSTONE);
  p.scatter(['palm', 'bush'], clutter(cfg, 5), t => t === T.GRASS || t === T.SAND);
  p.scatter(['tent', 'campfire', 'crate', 'cart'], clutter(cfg, 3), t => t === T.SAND);
}, { density: 'Rock outcrops', complexity: 'Buried ruins', water: 'Oasis', props: 'Scatter' });

/* ================= ARCTIC ================= */

defGen('arctic', 'Frozen Wastes', 'Wilderness', (map, rng, cfg) => {
  map.fill(T.SNOW);
  noiseSpeckle(map, rng, T.SNOW, T.ICE, 0.58, 0.11);
  const outcrops = Math.round(2 + cfg.density * 5);
  for (let i = 0; i < outcrops; i++)
    carveBlob(map, rng, rng.int(3, map.w - 4), rng.int(3, map.h - 4), rng.range(1, 2.6), T.ROCK_ICE, 0.55);
  // crevasses — narrow cracks, with a rim of bare ice along the lip
  const nC = Math.round(cfg.complexity * 2.2);
  for (let i = 0; i < nC; i++) {
    const horiz = rng.chance(0.5);
    const a = horiz ? [0, rng.int(2, map.h - 3)] : [rng.int(2, map.w - 3), 0];
    const b = horiz ? [map.w - 1, rng.int(2, map.h - 3)] : [rng.int(2, map.w - 3), map.h - 1];
    windingPath(map, rng, a[0], a[1], b[0], b[1], rng.range(1.6, 2.6), (x, y) => map.set(x, y, T.ICE));
    windingPath(map, rng, a[0], a[1], b[0], b[1], rng.range(0.7, 1.3), (x, y) => map.set(x, y, T.CHASM));
  }
  if (cfg.water > 0.05) {
    for (let i = 0; i < 1 + Math.round(cfg.water * 3); i++) {
      const cx = rng.int(5, map.w - 6), cy = rng.int(5, map.h - 6);
      const r = 1.5 + cfg.water * 5;
      carveBlob(map, rng, cx, cy, r * rng.range(0.8, 1.2), T.ICE, 0.45);
      carveBlob(map, rng, cx, cy, r * rng.range(0.45, 0.7), T.DEEP, 0.45);
    }
  }

  const p = new Placer(map, rng);
  p.scatter(['ice_shard', 'rock', 'rock_small'], clutter(cfg, 17), t => t === T.SNOW || t === T.ICE || t === T.ROCK_ICE);
  p.scatter(['tree_pine', 'tree_dead', 'stump'], clutter(cfg, 12), t => t === T.SNOW);
  p.scatter(['bones', 'skull', 'crate', 'tent', 'campfire'], clutter(cfg, 6), t => t === T.SNOW);
}, { density: 'Rock outcrops', complexity: 'Crevasses', water: 'Frozen lakes', props: 'Scatter' });

/* ================= VOLCANIC ================= */

defGen('volcanic', 'Volcanic Caldera', 'Underground', (map, rng, cfg) => {
  map.fill(T.ASH);
  noiseSpeckle(map, rng, T.ASH, T.ROCK, 0.62, 0.12);
  const rivers = 1 + Math.round(cfg.lava * 3);
  for (let i = 0; i < rivers; i++) {
    const horiz = rng.chance(0.5);
    const a = horiz ? [0, rng.int(2, map.h - 3)] : [rng.int(2, map.w - 3), 0];
    const b = horiz ? [map.w - 1, rng.int(2, map.h - 3)] : [rng.int(2, map.w - 3), map.h - 1];
    windingPath(map, rng, a[0], a[1], b[0], b[1], 1.2 + cfg.lava * 3.5, (x, y) => map.set(x, y, T.LAVA));
  }
  const pools = Math.round(cfg.lava * 5);
  for (let i = 0; i < pools; i++)
    carveBlob(map, rng, rng.int(3, map.w - 4), rng.int(3, map.h - 4), rng.range(1.2, 3), T.LAVA, 0.5);
  for (let i = 0; i < Math.round(cfg.complexity * 4); i++)
    carveBlob(map, rng, rng.int(3, map.w - 4), rng.int(3, map.h - 4), rng.range(1, 2.6), T.CHASM, 0.5);
  // scorched stone islands — density decides how much footing there is
  noiseSpeckle(map, rng, T.ASH, T.STONE, 0.78 - cfg.density * 0.34, 0.18);
  for (let i = 0; i < Math.round(cfg.density * 6); i++)
    carveBlob(map, rng, rng.int(3, map.w - 4), rng.int(3, map.h - 4),
      rng.range(1.2, 1.6 + cfg.density * 2.4), T.ROCK, 0.5);
  // bridges over lava
  if (rng.chance(0.7)) {
    const horiz = rng.chance(0.5);
    const a = horiz ? [0, rng.int(3, map.h - 4)] : [rng.int(3, map.w - 4), 0];
    const b = horiz ? [map.w - 1, rng.int(3, map.h - 4)] : [rng.int(3, map.w - 4), map.h - 1];
    windingPath(map, rng, a[0], a[1], b[0], b[1], 1.4, (x, y) => {
      if (map.get(x, y) === T.LAVA || map.get(x, y) === T.CHASM) map.set(x, y, T.BRIDGE);
    });
  }
  outlineWalls(map, T.ROCK, T.ROCK);

  const p = new Placer(map, rng);
  p.scatter(['rock', 'rock_small', 'stalagmite', 'bones', 'skull', 'rubble_pile'],
    clutter(cfg, 18), t => t === T.ASH || t === T.STONE);
  p.scatter(['brazier', 'crystal'], clutter(cfg, 5), t => t === T.ASH || t === T.STONE);
  p.scatter(['altar', 'statue', 'pillar'], clutter(cfg, 3), t => t === T.STONE);
}, { density: 'Solid footing', complexity: 'Fissures', lava: 'Lava flow', props: 'Scatter' });

/* ================= COAST ================= */

defGen('coast', 'Coast / Beach', 'Wilderness', (map, rng, cfg) => {
  const seed = rng.int(0, 99999);
  const horiz = rng.chance(0.5);
  const shoreAt = (v) => {
    const base = (horiz ? map.h : map.w) * rng.range(0.35, 0.6);
    return base;
  };
  const base = (horiz ? map.h : map.w) * 0.5;
  const beach = 2 + cfg.density * 4;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const along = horiz ? x : y, across = horiz ? y : x;
    const wobble = (fbm(along * (0.05 + cfg.complexity * 0.16), 4.2, seed, 4) - 0.5)
      * (horiz ? map.h : map.w) * (0.12 + cfg.complexity * 0.7);
    const line = base + wobble + ((horiz ? map.h : map.w) * (0.5 - cfg.water) * 0.7);
    const d = across - line;
    let t;
    if (d < -3.5) t = T.DEEP;
    else if (d < -0.5) t = T.WATER;
    else if (d < beach) t = T.SAND;
    else if (d < beach + 2.5) t = rng.chance(0.5) ? T.SAND : T.GRASS;
    else t = T.GRASS;
    map.set(x, y, t);
  }
  noiseSpeckle(map, rng, T.GRASS, T.MOSS, 0.6, 0.14);
  for (let i = 0; i < Math.round(cfg.complexity * 7); i++)
    carveBlob(map, rng, rng.int(2, map.w - 3), rng.int(2, map.h - 3), rng.range(1, 2.4), T.ROCK, 0.5);

  const p = new Placer(map, rng);
  p.scatter(['palm', 'bush', 'tree_oak', 'flowers'], clutter(cfg, 12), t => t === T.GRASS || t === T.MOSS);
  p.scatter(['rock', 'rock_small', 'log', 'bones'], clutter(cfg, 16), t => t === T.SAND || t === T.ROCK);
  p.scatter(['boat'], rng.chance(0.8) ? 1 : 0, t => t === T.SAND || t === T.WATER);
  p.scatter(['crate', 'barrel', 'campfire', 'tent', 'anchor'], clutter(cfg, 4.5), t => t === T.SAND);
}, { density: 'Beach width', complexity: 'Ragged coastline', water: 'Sea level', props: 'Scatter' });

/* ================= SHIP ================= */

defGen('ship', 'Ship Deck', 'Structure', (map, rng, cfg) => {
  map.fill(T.DEEP);
  // shallower, choppier water as the knob comes down; rocks to run aground on
  if (cfg.water < 0.6) noiseSpeckle(map, rng, T.DEEP, T.WATER, 0.3 + cfg.water, 0.12);
  for (let i = 0; i < Math.round((1 - cfg.water) * 5); i++)
    carveBlob(map, rng, rng.int(1, map.w - 2), rng.int(1, map.h - 2), rng.range(0.8, 1.8), T.ROCK, 0.5);
  // The hull runs along whichever map axis is longer.
  const horiz = map.w >= map.h;
  const L = horiz ? map.w : map.h;        // bow-to-stern
  const B = horiz ? map.h : map.w;        // beam
  const set = (a, c, t) => horiz ? map.set(a, c, t) : map.set(c, a, t);
  const cellOf = (a, c) => horiz ? [a, c] : [c, a];
  const get = (a, c) => horiz ? map.get(a, c) : map.get(c, a);
  const centre = (B - 1) / 2;
  const bow = 1, stern = L - 2;
  const maxHW = Math.min((B - 2) / 2, 3 + cfg.density * 5);
  if (maxHW < 1.5 || stern - bow < 6) { map.fill(T.WOOD); return; }

  // Sharp bow, parallel midships, gently tucked stern.
  const profile = (t) => {
    if (t < 0 || t > 1) return -1;
    if (t < 0.26) return maxHW * Math.pow(Math.sin((t / 0.26) * Math.PI / 2), 0.7);
    if (t > 0.84) return maxHW * (1 - 0.28 * Math.pow((t - 0.84) / 0.16, 2));
    return maxHW;
  };

  for (let a = 0; a < L; a++) {
    const t = (a + 0.5 - bow) / (stern - bow);
    const hw = profile(t);
    if (hw < 0.6) continue;
    for (let c = 0; c < B; c++) {
      const d = Math.abs(c - centre);
      if (d <= hw) set(a, c, d > hw - 1 ? T.WALL_WOOD : T.WOOD);
    }
  }
  // transom across the stern
  for (let c = 0; c < B; c++) if (Math.abs(c - centre) <= profile(1)) set(stern, c, T.WALL_WOOD);

  // stern cabin — complexity decides how much superstructure the ship carries
  const cHW = Math.floor(maxHW - 1.5);
  const a0 = Math.round(bow + (stern - bow) * (0.82 - cfg.complexity * 0.3)), a1 = stern - 1;
  const p = new Placer(map, rng);
  let cabin = null;
  if (cHW >= 1 && a1 - a0 >= 2) {
    const c0 = Math.ceil(centre - cHW), c1 = Math.floor(centre + cHW);
    for (let a = a0; a <= a1; a++)
      for (let c = c0; c <= c1; c++)
        set(a, c, (a === a0 || a === a1 || c === c0 || c === c1) ? T.WALL_WOOD : T.WOOD);
    const dc = Math.round(centre);
    set(a0, dc, T.WOOD);
    const [dx, dy] = cellOf(a0, dc);
    addDoor(map, dx, dy, horiz ? 'v' : 'h');
    cabin = { a0, a1, c0, c1 };
  }
  const inCabin = (x, y) => {
    if (!cabin) return false;
    const a = horiz ? x : y, c = horiz ? y : x;
    return a >= cabin.a0 && a <= cabin.a1 && c >= cabin.c0 && c <= cabin.c1;
  };

  // forecastle at the bow once there's enough superstructure
  if (cfg.complexity > 0.45 && cHW >= 1) {
    const f1 = Math.round(bow + (stern - bow) * 0.22), f0 = Math.max(bow + 1, f1 - 3);
    const fHW = Math.max(1, cHW - 1);
    const c0 = Math.ceil(centre - fHW), c1 = Math.floor(centre + fHW);
    for (let a = f0; a <= f1; a++)
      for (let c = c0; c <= c1; c++)
        if (get(a, c) === T.WOOD || get(a, c) === T.WALL_WOOD)
          set(a, c, (a === f0 || a === f1 || c === c0 || c === c1) ? T.WALL_WOOD : T.WOOD);
    const dc = Math.round(centre);
    set(f1, dc, T.WOOD);
    const [dx, dy] = cellOf(f1, dc);
    addDoor(map, dx, dy, horiz ? 'v' : 'h');
  }
  const mastFracs = cfg.complexity > 0.6 ? [0.28, 0.5, 0.7] : cfg.complexity > 0.25 ? [0.34, 0.6] : [0.45];
  for (const frac of mastFracs) {
    if (frac > 0.5 && L < 22) continue;
    const [mx, my] = cellOf(Math.round(bow + (stern - bow) * frac), Math.round(centre));
    p.place('mast', mx, my);
  }
  const [lx, ly] = cellOf(Math.round(bow + (stern - bow) * 0.47), Math.round(centre) + 1);
  p.place('ladder', lx, ly);

  p.scatter(['table_round', 'chair', 'bed', 'desk', 'chest', 'lantern'], clutter(cfg, 5.5),
    (t, x, y) => t === T.WOOD && inCabin(x, y));
  p.scatter(['barrel', 'crate', 'crates_stack', 'sack', 'keg', 'anchor', 'cage', 'weapon_rack'],
    clutter(cfg, 12), (t, x, y) => t === T.WOOD && !inCabin(x, y));
  p.scatter(['lantern', 'torch'], clutter(cfg, 4), (t, x, y) => t === T.WOOD && !inCabin(x, y));
}, { density: 'Hull beam', complexity: 'Superstructure', water: 'Depth of water', props: 'Cargo' });

/* ================= ARENA ================= */

defGen('arena', 'Arena / Pit', 'Structure', (map, rng, cfg) => {
  map.fill(T.STONE);
  const cx = (map.w - 1) / 2, cy = (map.h - 1) / 2;
  const rx = map.w * (0.3 + cfg.complexity * 0.16), ry = map.h * (0.3 + cfg.complexity * 0.16);
  const seed = rng.int(0, 99999);
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    const wob = (fbm(x * 0.2, y * 0.2, seed, 3) - 0.5) * 0.08;
    if (d + wob < 0.86) map.set(x, y, T.SAND);
    else if (d + wob < 1.0) map.set(x, y, T.WALL);
    else map.set(x, y, T.STONE);
  }
  noiseSpeckle(map, rng, T.SAND, T.DIRT, 0.7, 0.2);
  // flooded arena floor
  if (cfg.water > 0.1) {
    const wseed = rng.int(0, 99999);
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      if (map.get(x, y) !== T.SAND && map.get(x, y) !== T.DIRT) continue;
      if (fbm(x * 0.12, y * 0.12, wseed, 4) < cfg.water * 0.62) map.set(x, y, T.WATER);
    }
  }

  // gates
  const gates = 1 + Math.round(cfg.complexity * 5);
  for (let i = 0; i < gates; i++) {
    const a = (i / gates) * Math.PI * 2 + rng.range(0, 1);
    for (let d = 0.78; d < 1.15; d += 0.04) {
      const x = Math.round(cx + Math.cos(a) * rx * d), y = Math.round(cy + Math.sin(a) * ry * d);
      if (map.inBounds(x, y)) map.set(x, y, T.STONE);
    }
    const gx = Math.round(cx + Math.cos(a) * rx * 0.95), gy = Math.round(cy + Math.sin(a) * ry * 0.95);
    if (map.inBounds(gx, gy)) addDoor(map, gx, gy, Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? 'v' : 'h');
  }

  const p = new Placer(map, rng);
  // obstacles to fight around — that's the density knob
  const pillars = Math.round(cfg.density * 12);
  for (let i = 0; i < pillars; i++) {
    const a = (i / Math.max(1, pillars)) * Math.PI * 2;
    const rr = 0.35 + (i % 2) * 0.35;
    p.place(rng.chance(0.6) ? 'pillar' : 'rock',
      Math.round(cx + Math.cos(a) * rx * rr), Math.round(cy + Math.sin(a) * ry * rr));
  }
  for (let i = 0; i < Math.round(cfg.density * 6); i++)
    p.place(rng.pick(['rubble_pile', 'crates_stack', 'menhir', 'statue']),
      rng.int(3, map.w - 4), rng.int(3, map.h - 4));
  p.scatter(['statue', 'cage', 'weapon_rack', 'rubble_pile', 'bones', 'skull', 'barrel', 'crate'],
    clutter(cfg, 13), t => t === T.SAND || t === T.DIRT || t === T.STONE);
  p.scatter(['brazier'], clutter(cfg, 7), t => t === T.STONE || t === T.SAND);
}, { density: 'Obstacles', complexity: 'Size & gates', water: 'Flooding', props: 'Dressing' });

/* ================= BLANK ================= */

defGen('blank_stone', 'Blank — Stone', 'Blank', (map) => map.fill(T.STONE), {});
defGen('blank_grass', 'Blank — Grass', 'Blank', (map, rng) => {
  map.fill(T.GRASS); noiseSpeckle(map, rng, T.GRASS, T.MOSS, 0.55, 0.14);
}, {});
defGen('blank_void', 'Blank — Empty', 'Blank', (map) => map.fill(T.VOID), {});

/* ---------------- entry point ---------------- */

function generateMap(cfg) {
  const rng = new RNG(cfg.seed);
  const map = new GameMap(cfg.w, cfg.h, cfg.ppg);
  map.seed = cfg.seed; map.theme = cfg.type;
  map.name = cfg.name || (GENERATORS[cfg.type] ? GENERATORS[cfg.type].label : 'Map');
  const g = GENERATORS[cfg.type] || GENERATORS.dungeon;
  g.gen(map, rng, cfg);
  validateDoors(map);
  syncLightsFromProps(map);
  return map;
}

/** Rebuild the light list from any props that emit light. */
function syncLightsFromProps(map) {
  map.lights = map.lights.filter(l => !l.fromProp);
  for (const pr of map.props) {
    const def = PROPS[pr.type];
    if (def && def.light) {
      // a prop may override the colour, reach and strength of its own light,
      // so one torch can burn green and the next orange
      map.lights.push({
        x: pr.x, y: pr.y,
        range: pr.lightRange === undefined ? def.light.range : pr.lightRange,
        intensity: pr.lightIntensity === undefined ? def.light.intensity : pr.lightIntensity,
        color: pr.lightColor || def.light.color,
        fromProp: true
      });
    }
  }
}
