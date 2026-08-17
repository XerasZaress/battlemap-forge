/* Battlemap Forge — wall extraction and VTT export formats */
'use strict';

/* ---------------- line-of-sight extraction ----------------
   Emits polylines in GRID units along every boundary between a
   sight-blocking cell and an open one, merging collinear runs. */

/** Merged runs of edge walls, in grid units. Doors are gaps, not walls. */
function extractEdgeWalls(map) {
  const segs = [];
  for (let y = 0; y <= map.h; y++) {
    let start = null;
    for (let x = 0; x <= map.w; x++) {
      const on = x < map.w && map.getH(x, y) === EDGE.WALL;
      if (on && start === null) start = x;
      if (!on && start !== null) { segs.push([[start, y], [x, y]]); start = null; }
    }
  }
  for (let x = 0; x <= map.w; x++) {
    let start = null;
    for (let y = 0; y <= map.h; y++) {
      const on = y < map.h && map.getV(x, y) === EDGE.WALL;
      if (on && start === null) start = y;
      if (!on && start !== null) { segs.push([[x, start], [x, y]]); start = null; }
    }
  }
  return segs;
}

/** Every door on an edge, described the way a VTT portal wants it. */
function edgePortals(map) {
  const out = [];
  for (let y = 0; y <= map.h; y++) for (let x = 0; x < map.w; x++) {
    const v = map.getH(x, y);
    if (isEdgeDoor(v)) out.push({ x0: x, y0: y, x1: x + 1, y1: y, cx: x + 0.5, cy: y, secret: v === EDGE.SECRET });
  }
  for (let x = 0; x <= map.w; x++) for (let y = 0; y < map.h; y++) {
    const v = map.getV(x, y);
    if (isEdgeDoor(v)) out.push({ x0: x, y0: y, x1: x, y1: y + 1, cx: x, cy: y + 0.5, secret: v === EDGE.SECRET });
  }
  return out;
}

function extractWalls(map, opts) {
  const o = Object.assign({ border: true, props: true }, opts || {});
  const blocked = (x, y) => {
    if (!map.inBounds(x, y)) return o.border;
    return blocksSight(map.cells[y * map.w + x]);
  };
  const doorAt = new Set(map.doors.map(d => d.x + ',' + d.y));
  const segs = [];

  // horizontal boundaries: the line y = Y between rows Y-1 and Y
  for (let y = 0; y <= map.h; y++) {
    let runStart = null;
    for (let x = 0; x <= map.w; x++) {
      const edge = x < map.w && (blocked(x, y - 1) !== blocked(x, y));
      if (edge && runStart === null) runStart = x;
      if (!edge && runStart !== null) { segs.push([[runStart, y], [x, y]]); runStart = null; }
    }
  }
  // vertical boundaries: the line x = X between columns X-1 and X
  for (let x = 0; x <= map.w; x++) {
    let runStart = null;
    for (let y = 0; y <= map.h; y++) {
      const edge = y < map.h && (blocked(x - 1, y) !== blocked(x, y));
      if (edge && runStart === null) runStart = y;
      if (!edge && runStart !== null) { segs.push([[x, runStart], [x, y]]); runStart = null; }
    }
  }

  // blocking props (pillars, trees, statues) become their own small boxes
  if (o.props) {
    for (const p of map.props) {
      const def = PROPS[p.type];
      if (!def || !def.blocks) continue;
      // footprint follows the prop's own rotation, scale and stretch
      const sc = p.scale === undefined ? 1 : p.scale;
      const wd = p.width === undefined ? 1 : p.width;
      const ht = p.height === undefined ? 1 : p.height;
      const hx = Math.max(0.22, def.size * sc * wd * 0.3);
      const hy = Math.max(0.22, def.size * sc * ht * 0.3);
      const a = p.rot || 0, cos = Math.cos(a), sin = Math.sin(a);
      const corner = (dx, dy) => [p.x + dx * cos - dy * sin, p.y + dx * sin + dy * cos];
      const c0 = corner(-hx, -hy), c1 = corner(hx, -hy), c2 = corner(hx, hy), c3 = corner(-hx, hy);
      segs.push([c0, c1, c2, c3, c0]);
    }
  }
  for (const s of extractEdgeWalls(map)) segs.push(s);
  for (const w of map.extraWalls) segs.push([[w[0], w[1]], [w[2], w[3]]]);
  return segs;
}

/* ---------------- Universal VTT (.dd2vtt / .uvtt / .df2vtt) ---------------- */

function toUVTT(map, pngBase64, opts) {
  const o = Object.assign({ bakedLighting: false, border: true, propWalls: true }, opts || {});
  const segs = extractWalls(map, { border: o.border, props: o.propWalls });

  const portals = map.doors.map(d => {
    const vertical = d.dir === 'v';
    const cx = d.x + 0.5, cy = d.y + 0.5;
    const bounds = vertical
      ? [{ x: cx, y: d.y }, { x: cx, y: d.y + 1 }]
      : [{ x: d.x, y: cy }, { x: d.x + 1, y: cy }];
    return {
      position: { x: cx, y: cy },
      bounds,
      rotation: vertical ? 0 : Math.PI / 2,
      closed: !d.open,
      freestanding: false
    };
  });
  for (const p of edgePortals(map)) {
    portals.push({
      position: { x: p.cx, y: p.cy },
      bounds: [{ x: p.x0, y: p.y0 }, { x: p.x1, y: p.y1 }],
      rotation: p.y0 === p.y1 ? Math.PI / 2 : 0,
      closed: true,
      freestanding: false
    });
  }

  const lights = map.lights.map(L => ({
    position: { x: L.x, y: L.y },
    range: L.range,
    intensity: clamp(L.intensity ?? 1, 0, 1),
    color: (L.color || '#ff9d4c').replace('#', '').toLowerCase() + 'ff',
    shadows: true
  }));

  return {
    format: 0.3,
    resolution: {
      map_origin: { x: 0, y: 0 },
      map_size: { x: map.w, y: map.h },
      pixels_per_grid: map.ppg
    },
    line_of_sight: segs.map(s => s.map(p => ({ x: p[0], y: p[1] }))),
    objects_line_of_sight: [],
    portals,
    environment: {
      baked_lighting: !!o.bakedLighting,
      ambient_light: o.bakedLighting ? 'ffffffff' : '00000000'
    },
    lights,
    image: pngBase64
  };
}

/* ---------------- Foundry VTT scene ---------------- */

function toFoundryScene(map, opts) {
  const o = Object.assign({ imageName: 'battlemap.png', gridDistance: 5, units: 'ft' }, opts || {});
  const u = map.ppg;
  const segs = extractWalls(map, { border: o.border !== false, props: o.propWalls !== false });
  const walls = [];
  for (const s of segs) {
    for (let i = 0; i < s.length - 1; i++) {
      walls.push({
        c: [Math.round(s[i][0] * u), Math.round(s[i][1] * u), Math.round(s[i + 1][0] * u), Math.round(s[i + 1][1] * u)],
        light: 20, move: 20, sight: 20, sound: 20, dir: 0, door: 0, ds: 0,
        flags: {}
      });
    }
  }
  for (const d of map.doors) {
    const c = d.dir === 'v'
      ? [Math.round((d.x + 0.5) * u), Math.round(d.y * u), Math.round((d.x + 0.5) * u), Math.round((d.y + 1) * u)]
      : [Math.round(d.x * u), Math.round((d.y + 0.5) * u), Math.round((d.x + 1) * u), Math.round((d.y + 0.5) * u)];
    walls.push({
      c, light: 20, move: 20, sight: 20, sound: 20, dir: 0,
      door: d.secret ? 2 : 1, ds: d.open ? 1 : 0, flags: {}
    });
  }
  for (const p of edgePortals(map)) {
    walls.push({
      c: [Math.round(p.x0 * u), Math.round(p.y0 * u), Math.round(p.x1 * u), Math.round(p.y1 * u)],
      light: 20, move: 20, sight: 20, sound: 20, dir: 0,
      door: p.secret ? 2 : 1, ds: 0, flags: {}
    });
  }

  const lights = map.lights.map(L => ({
    x: Math.round(L.x * u), y: Math.round(L.y * u), rotation: 0,
    walls: true, vision: false,
    config: {
      alpha: 0.35 * (L.intensity ?? 1),
      angle: 360,
      bright: +(L.range * o.gridDistance * 0.45).toFixed(1),
      dim: +(L.range * o.gridDistance).toFixed(1),
      color: L.color || '#ff9d4c',
      coloration: 1,
      luminosity: 0.5,
      attenuation: 0.5,
      animation: { type: L.color === '#7fd8ff' || L.color === '#7fffd4' ? 'pulse' : 'torch', speed: 3, intensity: 3 }
    }
  }));

  return {
    name: map.name || 'Battlemap Forge Scene',
    navigation: true,
    width: map.w * u,
    height: map.h * u,
    padding: 0,
    backgroundColor: '#000000',
    background: { src: o.imageName, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0, tint: null },
    grid: { type: 1, size: u, style: 'solidLines', thickness: 1, distance: o.gridDistance, units: o.units, color: '#000000', alpha: 0.2 },
    initial: null,
    tokenVision: true,
    fogExploration: true,
    globalLight: false,
    darkness: 0.6,
    walls,
    lights,
    tiles: [], drawings: [], tokens: [], sounds: [], notes: [], templates: [],
    flags: { 'battlemap-forge': { seed: map.seed, theme: map.theme } }
  };
}

/* ---------------- download helpers ---------------- */

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
}

function downloadText(text, filename, mime) {
  downloadBlob(new Blob([text], { type: mime || 'application/json' }), filename);
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(res => canvas.toBlob(res, type || 'image/png', quality));
}

function canvasToBase64(canvas, type, quality) {
  const url = canvas.toDataURL(type || 'image/png', quality);
  return url.slice(url.indexOf(',') + 1);
}

function safeName(s) {
  return (s || 'battlemap').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'battlemap';
}
