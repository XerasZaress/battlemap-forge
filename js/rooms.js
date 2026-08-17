/* Battlemap Forge — prefab rooms.
   Each is a furnished module you stamp onto the map: it fills its floor,
   walls its own perimeter and brings its furniture with it.
   Props are [type, x, y, quarterTurns, scale, width] in room-local squares. */
'use strict';

const ROOMS = {};
const ROOM_LIST = [];

function defRoom(key, label, cat, spec) {
  const r = Object.assign({ key, label, cat, floor: T.WOOD, wall: true, props: [] }, spec);
  ROOMS[key] = r; ROOM_LIST.push(r);
  return r;
}

const Q = Math.PI / 2;

/* ---------------- dwelling ---------------- */

defRoom('bedroom', 'Bedroom', 'dwelling', {
  w: 4, h: 4, floor: T.WOOD,
  props: [
    ['bed', 0.6, 1.2, 0], ['chest', 0.6, 3.3, 0], ['chair', 2.4, 3.4, 2],
    ['desk', 3.2, 1.0, 0], ['candles', 3.2, 0.6, 0], ['rug', 2.5, 2.3, 0, 0.55]
  ]
});

defRoom('study', 'Study', 'dwelling', {
  w: 4, h: 4, floor: T.WOOD,
  props: [
    ['desk', 2.0, 0.9, 0], ['chair', 2.0, 1.8, 2], ['bookshelf', 1.2, 3.5, 0],
    ['bookshelf', 3.0, 3.5, 0], ['candles', 2.6, 0.7, 0], ['rug', 2.0, 2.4, 0, 0.6]
  ]
});

defRoom('dining_hall', 'Dining Hall', 'dwelling', {
  w: 7, h: 5, floor: T.WOOD,
  props: [
    ['table_long', 2.2, 2.5, 1, 1, 1.6], ['table_long', 4.8, 2.5, 1, 1, 1.6],
    ['bench', 1.4, 2.5, 1], ['bench', 3.0, 2.5, 1],
    ['bench', 4.0, 2.5, 1], ['bench', 5.6, 2.5, 1],
    ['fireplace', 3.5, 0.45, 0], ['banner', 0.6, 0.7, 0], ['banner', 6.4, 0.7, 0],
    ['candles', 2.2, 1.7, 0], ['candles', 4.8, 3.3, 0]
  ]
});

defRoom('kitchen', 'Kitchen', 'dwelling', {
  w: 5, h: 4, floor: T.STONE,
  props: [
    ['fireplace', 2.5, 0.45, 0], ['cauldron', 2.5, 1.2, 0],
    ['table_long', 2.4, 2.6, 0, 0.9], ['barrel', 0.6, 3.4, 0], ['barrel', 1.4, 3.4, 0],
    ['pot', 4.4, 1.0, 0], ['pot', 4.4, 1.7, 0], ['sack', 4.4, 3.3, 0],
    ['crate', 0.6, 1.0, 0]
  ]
});

/* ---------------- trade ---------------- */

defRoom('tavern_common', 'Tavern Common Room', 'trade', {
  w: 8, h: 6, floor: T.WOOD,
  props: [
    ['bar_counter', 4.0, 0.6, 0, 1, 1.2],
    ['keg', 1.0, 0.7, 0], ['keg', 1.8, 0.7, 0],
    ['table_round', 2.2, 2.4, 0], ['stool', 1.4, 2.4, 0], ['stool', 3.0, 2.4, 0], ['stool', 2.2, 3.2, 0],
    ['table_round', 5.8, 2.4, 0], ['stool', 5.0, 2.4, 0], ['stool', 6.6, 2.4, 0], ['stool', 5.8, 3.2, 0],
    ['table_long', 4.0, 4.6, 0, 1, 1.3], ['bench', 2.6, 4.6, 1], ['bench', 5.4, 4.6, 1],
    ['fireplace', 7.4, 3.0, 1], ['candles', 2.2, 2.4, 0], ['candles', 5.8, 2.4, 0],
    ['lantern', 0.6, 5.4, 0]
  ]
});

defRoom('storeroom', 'Storeroom', 'trade', {
  w: 4, h: 4, floor: T.STONE,
  props: [
    ['crates_stack', 1.0, 1.0, 0], ['crate', 2.2, 0.7, 0], ['crate', 3.3, 0.7, 0],
    ['barrel', 0.6, 2.4, 0], ['barrel', 0.6, 3.3, 0], ['sack', 2.0, 3.3, 0],
    ['sack', 2.8, 3.4, 0], ['crates_stack', 3.3, 2.4, 0]
  ]
});

defRoom('smithy', 'Smithy', 'trade', {
  w: 5, h: 5, floor: T.STONE,
  props: [
    ['fireplace', 2.5, 0.45, 0], ['anvil', 2.4, 2.2, 0], ['weapon_rack', 4.4, 2.5, 1],
    ['barrel', 0.6, 1.2, 0], ['crate', 0.7, 4.3, 0], ['weapon_rack', 1.6, 4.4, 0],
    ['rubble_pile', 3.6, 4.3, 0, 0.7]
  ]
});

defRoom('alchemy_lab', 'Alchemy Lab', 'trade', {
  w: 5, h: 4, floor: T.WOOD,
  props: [
    ['desk', 1.6, 0.8, 0], ['bookshelf', 3.6, 0.5, 0], ['cauldron', 4.2, 2.4, 0],
    ['pot', 0.6, 2.2, 0], ['pot', 0.6, 2.9, 0], ['crate', 2.6, 3.3, 0],
    ['candles', 1.6, 1.5, 0], ['crystal', 3.0, 2.2, 0]
  ]
});

defRoom('stable', 'Stable', 'trade', {
  w: 6, h: 4, floor: T.DIRT,
  props: [
    ['cart', 4.6, 2.0, 1], ['sack', 0.6, 0.7, 0], ['sack', 1.3, 0.6, 0],
    ['sack', 0.7, 1.4, 0], ['barrel', 0.6, 3.3, 0], ['crate', 2.4, 0.7, 0],
    ['log', 2.6, 3.4, 0, 0.8]
  ]
});

/* ---------------- sacred ---------------- */

defRoom('shrine', 'Shrine', 'sacred', {
  w: 5, h: 5, floor: T.STONE,
  props: [
    ['altar', 2.5, 1.0, 0], ['brazier', 1.0, 1.0, 0], ['brazier', 4.0, 1.0, 0],
    ['pillar', 1.0, 3.2, 0], ['pillar', 4.0, 3.2, 0],
    ['carpet', 2.5, 3.2, 1, 0.8], ['candles', 2.5, 2.0, 0]
  ]
});

defRoom('crypt_chamber', 'Crypt Chamber', 'sacred', {
  w: 5, h: 5, floor: T.STONE,
  props: [
    ['sarcophagus', 1.3, 2.4, 0], ['sarcophagus', 3.7, 2.4, 0],
    ['brazier', 2.5, 0.7, 0], ['gravestone', 0.7, 4.3, 0], ['gravestone', 4.3, 4.3, 0],
    ['skull', 2.5, 4.2, 0], ['bones', 3.2, 1.0, 0], ['spiderweb', 0.8, 0.8, 0, 0.8]
  ]
});

defRoom('throne_room', 'Throne Room', 'sacred', {
  w: 7, h: 6, floor: T.STONE,
  props: [
    ['throne', 3.5, 0.9, 0], ['carpet', 3.5, 3.4, 0, 1, 1.1],
    ['pillar', 1.2, 2.2, 0], ['pillar', 5.8, 2.2, 0],
    ['pillar', 1.2, 4.4, 0], ['pillar', 5.8, 4.4, 0],
    ['brazier', 2.3, 1.0, 0], ['brazier', 4.7, 1.0, 0],
    ['banner', 2.4, 0.4, 0], ['banner', 4.6, 0.4, 0], ['statue', 0.7, 5.3, 0]
  ]
});

/* ---------------- martial ---------------- */

defRoom('barracks', 'Barracks', 'martial', {
  w: 6, h: 5, floor: T.WOOD,
  props: [
    ['bed', 0.7, 1.2, 0], ['bed', 0.7, 3.6, 0], ['bed', 5.3, 1.2, 0], ['bed', 5.3, 3.6, 0],
    ['chest', 1.7, 1.2, 0], ['chest', 1.7, 3.6, 0], ['chest', 4.3, 1.2, 0], ['chest', 4.3, 3.6, 0],
    ['weapon_rack', 3.0, 0.5, 0], ['table_round', 3.0, 3.0, 0], ['stool', 3.0, 3.9, 0]
  ]
});

defRoom('armoury', 'Armoury', 'martial', {
  w: 5, h: 4, floor: T.STONE,
  props: [
    ['weapon_rack', 2.5, 0.5, 0], ['weapon_rack', 2.5, 3.5, 0],
    ['weapon_rack', 0.5, 2.0, 1], ['weapon_rack', 4.5, 2.0, 1],
    ['crate', 1.6, 2.0, 0], ['crates_stack', 3.4, 2.0, 0], ['anvil', 2.5, 2.0, 0, 0.8]
  ]
});

defRoom('guard_post', 'Guard Post', 'martial', {
  w: 3, h: 3, floor: T.STONE,
  props: [
    ['table_round', 1.5, 1.2, 0, 0.85], ['stool', 0.7, 1.2, 0], ['stool', 2.3, 1.2, 0],
    ['weapon_rack', 1.5, 2.5, 0, 0.8], ['lantern', 1.5, 0.5, 0]
  ]
});

defRoom('cell_block', 'Cell Block', 'martial', {
  w: 6, h: 4, floor: T.STONE,
  props: [
    ['cage', 1.2, 1.2, 0], ['cage', 3.0, 1.2, 0], ['cage', 4.8, 1.2, 0],
    ['bones', 1.2, 3.2, 0], ['skull', 3.0, 3.3, 0], ['sack', 4.8, 3.2, 0],
    ['torch', 0.5, 3.5, 0], ['rubble_pile', 5.4, 3.4, 0, 0.7]
  ]
});

/* ---------------- utility ---------------- */

defRoom('library', 'Library', 'utility', {
  w: 6, h: 5, floor: T.WOOD,
  props: [
    ['bookshelf', 1.5, 0.5, 0], ['bookshelf', 3.5, 0.5, 0],
    ['bookshelf', 0.5, 2.0, 1], ['bookshelf', 0.5, 3.5, 1],
    ['bookshelf', 5.5, 2.0, 1], ['bookshelf', 5.5, 3.5, 1],
    ['desk', 3.0, 2.6, 0], ['chair', 3.0, 3.5, 2], ['candles', 3.6, 2.4, 0],
    ['rug', 3.0, 4.2, 0, 0.7]
  ]
});

defRoom('washroom', 'Washroom', 'utility', {
  w: 4, h: 3, floor: T.STONE,
  props: [
    ['fountain', 2.0, 1.2, 0, 0.75], ['pot', 0.6, 2.3, 0], ['pot', 3.4, 2.3, 0],
    ['barrel', 3.4, 0.7, 0]
  ]
});

defRoom('corridor', 'Corridor', 'utility', {
  w: 6, h: 2, floor: T.STONE,
  props: [['torch', 1.5, 0.4, 0], ['torch', 4.5, 0.4, 0], ['rubble_pile', 3.2, 1.4, 0, 0.6]]
});

defRoom('empty_small', 'Empty Room (small)', 'utility', { w: 4, h: 4, floor: T.STONE, props: [] });
defRoom('empty_large', 'Empty Room (large)', 'utility', { w: 8, h: 6, floor: T.STONE, props: [] });

const ROOM_CATEGORIES = ['dwelling', 'trade', 'sacred', 'martial', 'utility'];

/**
 * A prefab turned and/or mirrored. `rot` is quarter turns clockwise (0-3),
 * `flip` mirrors horizontally afterwards. Together these give all eight
 * orientations. Returns room-local geometry; nothing is placed.
 */
function transformRoom(key, rot, flip) {
  const room = ROOMS[key];
  if (!room) return null;
  rot = ((rot || 0) % 4 + 4) % 4;
  let w = room.w, h = room.h;
  let props = room.props.map(p => ({
    type: p[0], x: p[1], y: p[2],
    rot: (p[3] || 0) * Q,
    scale: p[4] === undefined ? 1 : p[4],
    width: p[5] === undefined ? 1 : p[5],
    mirror: false
  }));

  for (let i = 0; i < rot; i++) {
    // (x, y) in a w×h room becomes (h - y, x) in an h×w room
    props = props.map(p => ({ ...p, x: h - p.y, y: p.x, rot: p.rot + Q }));
    const t = w; w = h; h = t;
  }
  if (flip) {
    // mirror across the vertical centre line; the prop itself mirrors too, so
    // asymmetric furniture reads correctly rather than merely being moved
    props = props.map(p => ({ ...p, x: w - p.x, rot: Math.PI - p.rot, mirror: !p.mirror }));
  }
  // A captured room brings its own terrain and partitions rather than a single
  // floor colour, so those grids have to be turned and mirrored too.
  let cells = room.cells ? room.cells.slice() : null;
  let hw = room.hw ? room.hw.slice() : null;
  let vw = room.vw ? room.vw.slice() : null;
  let cw = room.w, ch = room.h;

  for (let i = 0; i < rot; i++) {
    if (cells) {
      const out = new Array(cw * ch);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++)
        out[x * ch + (ch - 1 - y)] = cells[y * cw + x];   // (x,y) -> (ch-1-y, x)
      cells = out;
    }
    if (hw && vw) {
      // turning swaps the two edge grids: "above" becomes "to the right of"
      const nHw = new Array(ch * (cw + 1)).fill(EDGE.NONE);   // new w=ch, h=cw
      const nVw = new Array((ch + 1) * cw).fill(EDGE.NONE);
      for (let y = 0; y <= ch; y++) for (let x = 0; x < cw; x++) {
        const v = hw[y * cw + x];
        if (v) nVw[x * (ch + 1) + (ch - y)] = v;             // H(x,y) -> V(ch-y, x)
      }
      for (let y = 0; y < ch; y++) for (let x = 0; x <= cw; x++) {
        const v = vw[y * (cw + 1) + x];
        if (v) nHw[x * ch + (ch - 1 - y)] = v;               // V(x,y) -> H(ch-1-y, x)
      }
      hw = nHw; vw = nVw;
    }
    const t = cw; cw = ch; ch = t;
  }
  if (flip) {
    if (cells) {
      const out = new Array(cw * ch);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++)
        out[y * cw + (cw - 1 - x)] = cells[y * cw + x];
      cells = out;
    }
    if (hw && vw) {
      const nHw = new Array(cw * (ch + 1)).fill(EDGE.NONE);
      const nVw = new Array((cw + 1) * ch).fill(EDGE.NONE);
      for (let y = 0; y <= ch; y++) for (let x = 0; x < cw; x++)
        if (hw[y * cw + x]) nHw[y * cw + (cw - 1 - x)] = hw[y * cw + x];
      for (let y = 0; y < ch; y++) for (let x = 0; x <= cw; x++)
        if (vw[y * (cw + 1) + x]) nVw[y * (cw + 1) + (cw - x)] = vw[y * (cw + 1) + x];
      hw = nHw; vw = nVw;
    }
  }

  return { w, h, floor: room.floor, wall: room.wall, label: room.label, props, cells, hw, vw };
}

/**
 * Stamp a prefab into a map with its top-left corner at (ox, oy).
 * Fills the floor, walls the perimeter, and brings the furniture.
 */
function stampRoom(map, key, ox, oy, opts) {
  const o = Object.assign({ walls: true, props: true, floor: null, rot: 0, flip: false }, opts || {});
  const room = transformRoom(key, o.rot, o.flip);
  if (!room) return null;
  const x1 = ox + room.w - 1, y1 = oy + room.h - 1;
  if (ox < 0 || oy < 0 || x1 >= map.w || y1 >= map.h) return null;

  if (room.cells) {
    for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++)
      map.set(ox + x, oy + y, room.cells[y * room.w + x]);
  } else {
    map.fillRect(ox, oy, x1, y1, o.floor === null ? room.floor : o.floor);
  }
  if (o.walls) {
    if (room.hw && room.vw) {
      for (let y = 0; y <= room.h; y++) for (let x = 0; x < room.w; x++) {
        const v = room.hw[y * room.w + x];
        if (v && !isEdgeDoor(map.getH(ox + x, oy + y))) map.setH(ox + x, oy + y, v);
      }
      for (let y = 0; y < room.h; y++) for (let x = 0; x <= room.w; x++) {
        const v = room.vw[y * (room.w + 1) + x];
        if (v && !isEdgeDoor(map.getV(ox + x, oy + y))) map.setV(ox + x, oy + y, v);
      }
    } else if (room.wall) {
      map.wallRect(ox, oy, x1, y1, EDGE.WALL);
    }
  }
  if (o.props) {
    for (const p of room.props) {
      if (!PROPS[p.type]) continue;
      map.addProp(p.type, ox + p.x, oy + p.y, {
        rot: p.rot, scale: p.scale, width: p.width, mirror: p.mirror,
        pid: o.pid                      // ties the prop to its placement
      });
    }
  }
  return { x: ox, y: oy, x1, y1, w: room.w, h: room.h };
}

/* ------------------------------------------------------------------ *
 * Live placements
 *
 * A stamped room stays a real object. To make that work without a full
 * layered document model, each placement records the strip of map that was
 * underneath it. Lifting the room restores that strip exactly, so moving,
 * turning or deleting a room leaves no scar on what it was covering.
 * ------------------------------------------------------------------ */

function capturePatch(map, x, y, w, h) {
  const cells = [], hw = [], vw = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) cells.push(map.get(x + i, y + j));
  for (let j = 0; j <= h; j++) for (let i = 0; i < w; i++) hw.push(map.getH(x + i, y + j));
  for (let j = 0; j < h; j++) for (let i = 0; i <= w; i++) vw.push(map.getV(x + i, y + j));
  return { cells, hw, vw };
}

function restorePatch(map, x, y, w, h, patch) {
  if (!patch) return;
  let k = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) map.set(x + i, y + j, patch.cells[k++]);
  k = 0;
  for (let j = 0; j <= h; j++) for (let i = 0; i < w; i++) map.setH(x + i, y + j, patch.hw[k++]);
  k = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i <= w; i++) map.setV(x + i, y + j, patch.vw[k++]);
}

function placementRect(pl) {
  return { x: pl.x, y: pl.y, x1: pl.x + pl.w - 1, y1: pl.y + pl.h - 1, w: pl.w, h: pl.h };
}

function rectsOverlap(a, b) {
  return a.x <= b.x1 && a.x1 >= b.x && a.y <= b.y1 && a.y1 >= b.y;
}

/** Paint a placement onto the map, remembering what it covered. */
function applyPlacement(map, pl, opts) {
  const o = Object.assign({ connect: false }, opts || {});
  const room = transformRoom(pl.key, pl.rot, pl.flip);
  if (!room) return null;
  pl.w = room.w; pl.h = room.h;
  if (pl.x < 0 || pl.y < 0 || pl.x + pl.w > map.w || pl.y + pl.h > map.h) return null;

  pl.under = capturePatch(map, pl.x, pl.y, pl.w, pl.h);
  const rect = stampRoom(map, pl.key, pl.x, pl.y, { rot: pl.rot, flip: pl.flip, pid: pl.id });
  if (o.connect) connectRoomToNeighbours(map, rect, isOpen);
  return rect;
}

/** Lift a placement back off the map. */
function liftPlacement(map, pl) {
  restorePatch(map, pl.x, pl.y, pl.w, pl.h, pl.under);
  map.props = map.props.filter(p => p.pid !== pl.id);
  pl.under = null;
}

/** Redraw any other placements the given rect disturbed, so overlapping or
    touching rooms keep their walls and floors. Their furniture is untouched. */
function repairNeighbours(map, rects, exceptId) {
  for (const pl of map.placements) {
    if (pl.id === exceptId) continue;
    const r = placementRect(pl);
    if (!rects.some(q => q && rectsOverlap(r, q))) continue;
    stampRoom(map, pl.key, pl.x, pl.y, { rot: pl.rot, flip: pl.flip, props: false, pid: pl.id });
  }
}

/** Change a placement in place — position, rotation or mirroring. */
function updatePlacement(map, pl, changes, opts) {
  const before = placementRect(pl);
  liftPlacement(map, pl);
  const prev = { x: pl.x, y: pl.y, rot: pl.rot, flip: pl.flip };
  Object.assign(pl, changes);

  // a turn swaps width and height; keep the room centred on the same spot
  const room = transformRoom(pl.key, pl.rot, pl.flip);
  if (changes.rot !== undefined && room) {
    pl.x = Math.round(prev.x + (pl.w - room.w) / 2);
    pl.y = Math.round(prev.y + (pl.h - room.h) / 2);
  }
  if (room) {
    pl.x = clamp(pl.x, 0, map.w - room.w);
    pl.y = clamp(pl.y, 0, map.h - room.h);
  }

  if (!applyPlacement(map, pl, opts)) {          // out of bounds — put it back
    Object.assign(pl, prev);
    applyPlacement(map, pl, opts);
    repairNeighbours(map, [before, placementRect(pl)], pl.id);
    return false;
  }
  repairNeighbours(map, [before, placementRect(pl)], pl.id);
  return true;
}

function removePlacement(map, pl) {
  const rect = placementRect(pl);
  liftPlacement(map, pl);
  map.placements = map.placements.filter(p => p.id !== pl.id);
  repairNeighbours(map, [rect], pl.id);
}

/** Create and place a new prefab instance. */
function addPlacement(map, key, ox, oy, rot, flip, opts) {
  const room = transformRoom(key, rot, flip);
  if (!room) return null;
  if (ox < 0 || oy < 0 || ox + room.w > map.w || oy + room.h > map.h) return null;
  const pl = {
    id: map.nextPid++, key, x: ox, y: oy, rot: rot || 0, flip: !!flip,
    w: room.w, h: room.h, under: null
  };
  if (!applyPlacement(map, pl, opts)) return null;
  map.placements.push(pl);
  return pl;
}

/** Topmost placement containing a point, or null. */
function placementAt(map, gx, gy) {
  for (let i = map.placements.length - 1; i >= 0; i--) {
    const pl = map.placements[i];
    if (gx >= pl.x && gx < pl.x + pl.w && gy >= pl.y && gy < pl.y + pl.h) return pl;
  }
  return null;
}

/**
 * Cut a doorway wherever a freshly placed room backs onto an existing space.
 * One door per shared run, at its midpoint.
 */
function connectRoomToNeighbours(map, rect, isOpenFn) {
  const runs = [];
  const scan = (n, edgeAt, otherCell) => {
    let start = null;
    for (let i = 0; i <= n; i++) {
      const shared = i < n && otherCell(i);
      if (shared && start === null) start = i;
      if (!shared && start !== null) { runs.push({ from: start, to: i - 1, edgeAt }); start = null; }
    }
  };
  const W = rect.x1 - rect.x + 1, H = rect.y1 - rect.y + 1;
  scan(W, (i) => ({ x: rect.x + i, y: rect.y, dir: 'h' }), (i) => isOpenFn(map.get(rect.x + i, rect.y - 1)));
  scan(W, (i) => ({ x: rect.x + i, y: rect.y1 + 1, dir: 'h' }), (i) => isOpenFn(map.get(rect.x + i, rect.y1 + 1)));
  scan(H, (i) => ({ x: rect.x, y: rect.y + i, dir: 'v' }), (i) => isOpenFn(map.get(rect.x - 1, rect.y + i)));
  scan(H, (i) => ({ x: rect.x1 + 1, y: rect.y + i, dir: 'v' }), (i) => isOpenFn(map.get(rect.x1 + 1, rect.y + i)));

  let cut = 0;
  for (const r of runs) {
    const mid = (r.from + r.to) >> 1;
    const e = r.edgeAt(mid);
    if (map.getEdge(e.x, e.y, e.dir) === EDGE.WALL) {
      map.setEdge(e.x, e.y, e.dir, EDGE.DOOR);
      cut++;
    }
  }
  return cut;
}


/* ------------------------------------------------------------------ *
 * User-made prefab rooms
 *
 * Captured straight off the map: the terrain, the partitions and the furniture
 * inside a rectangle become a reusable room, turnable and mirrorable like any
 * built-in.
 * ------------------------------------------------------------------ */

const CUSTOM_ROOMS = {};
const CUSTOM_ROOM_KEY = 'battlemapforge.customrooms.v1';

/** Snapshot a rectangle of the map as a room definition. */
function captureRoom(map, x0, y0, x1, y1, label) {
  const ax = Math.max(0, Math.min(x0, x1)), ay = Math.max(0, Math.min(y0, y1));
  const bx = Math.min(map.w - 1, Math.max(x0, x1)), by = Math.min(map.h - 1, Math.max(y0, y1));
  const w = bx - ax + 1, h = by - ay + 1;
  if (w < 1 || h < 1) return null;

  const cells = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push(map.get(ax + x, ay + y));
  const hw = [];
  for (let y = 0; y <= h; y++) for (let x = 0; x < w; x++) hw.push(map.getH(ax + x, ay + y));
  const vw = [];
  for (let y = 0; y < h; y++) for (let x = 0; x <= w; x++) vw.push(map.getV(ax + x, ay + y));

  const props = [];
  for (const p of map.props) {
    if (p.x < ax || p.x > bx + 1 || p.y < ay || p.y > by + 1) continue;
    props.push([p.type, +(p.x - ax).toFixed(3), +(p.y - ay).toFixed(3),
      Math.round(((p.rot || 0) / Q) % 4), +(p.scale === undefined ? 1 : p.scale).toFixed(3),
      +(p.width === undefined ? 1 : p.width).toFixed(3)]);
  }

  return {
    key: 'room_' + Math.random().toString(36).slice(2, 9),
    label: label || 'My Room', cat: 'custom', w, h,
    floor: cells[0] !== undefined ? cells[0] : T.STONE, wall: false,
    cells, hw, vw, props, custom: true
  };
}

function registerCustomRoom(def) {
  CUSTOM_ROOMS[def.key] = def;
  ROOMS[def.key] = def;
  const i = ROOM_LIST.findIndex(r => r.key === def.key);
  if (i >= 0) ROOM_LIST[i] = def; else ROOM_LIST.push(def);
  if (ROOM_CATEGORIES.indexOf('custom') === -1) ROOM_CATEGORIES.push('custom');
  return def;
}

function deleteCustomRoom(key) {
  delete CUSTOM_ROOMS[key];
  delete ROOMS[key];
  const i = ROOM_LIST.findIndex(r => r.key === key);
  if (i >= 0) ROOM_LIST.splice(i, 1);
  saveCustomRooms();
}

function saveCustomRooms() {
  try {
    localStorage.setItem(CUSTOM_ROOM_KEY, JSON.stringify(Object.values(CUSTOM_ROOMS)));
    return true;
  } catch (e) { return false; }
}

function loadCustomRooms() {
  let raw = null;
  try { raw = localStorage.getItem(CUSTOM_ROOM_KEY); } catch (e) { return 0; }
  if (!raw) return 0;
  try {
    const list = JSON.parse(raw);
    for (const d of list) registerCustomRoom(d);
    return list.length;
  } catch (e) { return 0; }
}

/** Re-register custom rooms travelling inside a project file. */
function adoptCustomRooms(list) {
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (const d of list) { if (d && d.key) { registerCustomRoom(d); n++; } }
  if (n) saveCustomRooms();
  return n;
}


/* ------------------------------------------------------------------ *
 * Ad-hoc rooms
 *
 * A rectangle drawn with the Room tool becomes a real placement, so it can be
 * moved, turned, mirrored and deleted afterwards like any prefab. Its
 * definition is generated on the spot and kept out of the picker — it only
 * needs to exist so the placement has something to refer to.
 * ------------------------------------------------------------------ */

const ADHOC_ROOMS = {};

function adhocRoomDef(w, h, floor, withWalls) {
  const cells = new Array(w * h).fill(floor);
  const hw = new Array(w * (h + 1)).fill(EDGE.NONE);
  const vw = new Array((w + 1) * h).fill(EDGE.NONE);
  if (withWalls) {
    for (let x = 0; x < w; x++) { hw[x] = EDGE.WALL; hw[h * w + x] = EDGE.WALL; }
    for (let y = 0; y < h; y++) { vw[y * (w + 1)] = EDGE.WALL; vw[y * (w + 1) + w] = EDGE.WALL; }
  }
  return {
    key: 'adhoc_' + Math.random().toString(36).slice(2, 9),
    label: 'Room ' + w + '\u00d7' + h, cat: 'custom', w, h,
    floor, wall: false, cells, hw, vw, props: [], adhoc: true
  };
}

function registerAdhocRoom(def) {
  ADHOC_ROOMS[def.key] = def;
  ROOMS[def.key] = def;        // reachable by transformRoom / stampRoom
  return def;                  // deliberately not added to ROOM_LIST
}

function adoptAdhocRooms(list) {
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (const d of list) { if (d && d.key) { registerAdhocRoom(d); n++; } }
  return n;
}

/** Only the ad-hoc definitions a map actually uses need to travel with it. */
function usedAdhocRooms(map) {
  const keys = new Set((map.placements || []).map(p => p.key));
  return Object.values(ADHOC_ROOMS).filter(d => keys.has(d.key));
}
