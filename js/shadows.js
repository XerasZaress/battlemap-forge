/* Battlemap Forge — light occlusion.
 *
 * Baked lighting used to be radial gradients with nothing in the way, so a
 * torch lit the room next door straight through the masonry. Each light now
 * gets a visibility polygon computed against every barrier — solid rock, thin
 * partitions and closed doors alike — and its glow is clipped to that shape.
 *
 * The polygons only change when the walls or the lights change, so they are
 * cached and reused across animation frames.
 */
'use strict';

/** Every barrier on the map as flat [x1,y1,x2,y2] segments, in grid units. */
function lightBlockingSegments(map) {
  const segs = [];

  // solid terrain: the boundary between a blocking cell and an open one
  const blocked = (x, y) => (map.inBounds(x, y) ? blocksSight(map.cells[y * map.w + x]) : false);
  for (let y = 0; y <= map.h; y++) {
    let run = null;
    for (let x = 0; x <= map.w; x++) {
      const edge = x < map.w && (blocked(x, y - 1) !== blocked(x, y));
      if (edge && run === null) run = x;
      if (!edge && run !== null) { segs.push([run, y, x, y]); run = null; }
    }
  }
  for (let x = 0; x <= map.w; x++) {
    let run = null;
    for (let y = 0; y <= map.h; y++) {
      const edge = y < map.h && (blocked(x - 1, y) !== blocked(x, y));
      if (edge && run === null) run = y;
      if (!edge && run !== null) { segs.push([x, run, x, y]); run = null; }
    }
  }

  // thin partitions, including doors — a shut door stops light
  for (let y = 0; y <= map.h; y++)
    for (let x = 0; x < map.w; x++)
      if (map.getH(x, y) !== EDGE.NONE) segs.push([x, y, x + 1, y]);
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x <= map.w; x++)
      if (map.getV(x, y) !== EDGE.NONE) segs.push([x, y, x, y + 1]);

  return segs;
}

/** Distance along a ray to a segment, or null if it misses. */
function rayHit(ox, oy, dx, dy, s) {
  const x1 = s[0], y1 = s[1], x2 = s[2], y2 = s[3];
  const sx = x2 - x1, sy = y2 - y1;
  const den = dx * sy - dy * sx;
  if (Math.abs(den) < 1e-12) return null;              // parallel
  const t = ((x1 - ox) * sy - (y1 - oy) * sx) / den;   // along the ray
  if (t < 1e-9) return null;
  const u = ((x1 - ox) * dy - (y1 - oy) * dx) / den;   // along the segment
  if (u < -1e-9 || u > 1 + 1e-9) return null;
  return t;
}

/**
 * The lit region around a point: an angular sweep casting a ray just either
 * side of every corner, so shadow boundaries land exactly on the corner rather
 * than being approximated.
 */
function visibilityPolygon(cx, cy, R, segs) {
  // only barriers that could possibly matter
  const near = [];
  for (const s of segs) {
    const nx = clamp(cx, Math.min(s[0], s[2]), Math.max(s[0], s[2]));
    const ny = clamp(cy, Math.min(s[1], s[3]), Math.max(s[1], s[3]));
    if (Math.hypot(nx - cx, ny - cy) <= R + 1.5) near.push(s);
  }

  const angles = [];
  const EPS = 0.00025;
  for (const s of near) {
    for (const [px, py] of [[s[0], s[1]], [s[2], s[3]]]) {
      const a = Math.atan2(py - cy, px - cx);
      angles.push(a - EPS, a, a + EPS);
    }
  }
  // keep the unobstructed part round
  const N = 40;
  for (let i = 0; i < N; i++) angles.push(-Math.PI + (i / N) * Math.PI * 2);
  angles.sort((a, b) => a - b);

  const poly = [];
  for (const a of angles) {
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = R;
    for (const s of near) {
      const t = rayHit(cx, cy, dx, dy, s);
      if (t !== null && t < best) best = t;
    }
    poly.push([cx + dx * best, cy + dy * best]);
  }
  return poly;
}

/**
 * A visibility polygon per light. `signature` lets callers tell cheaply
 * whether a cached result is still valid.
 */
function computeLightShadows(map) {
  const segs = lightBlockingSegments(map);
  const out = [];
  for (const L of map.lights) {
    const R = Math.max(0.6, L.range || 4);
    // a light sitting inside a wall would see nothing; nudge it to open ground
    out.push(visibilityPolygon(L.x, L.y, R * 1.05, segs));
  }
  return { polys: out, signature: lightSignature(map) };
}

/** Cheap fingerprint of everything the shadows depend on. */
function lightSignature(map) {
  let h = map.lights.length * 2654435761;
  for (const L of map.lights) {
    h = (h ^ Math.round(L.x * 32) * 73856093) >>> 0;
    h = (h ^ Math.round(L.y * 32) * 19349663) >>> 0;
    h = (h ^ Math.round((L.range || 4) * 16) * 83492791) >>> 0;
  }
  for (let i = 0; i < map.hw.length; i++) if (map.hw[i]) h = (h ^ (i * 2246822519)) >>> 0;
  for (let i = 0; i < map.vw.length; i++) if (map.vw[i]) h = (h ^ (i * 3266489917)) >>> 0;
  for (let i = 0; i < map.cells.length; i++)
    if (blocksSight(map.cells[i])) h = (h ^ (i * 668265263)) >>> 0;
  return h >>> 0;
}

/** Build a clip path for a polygon, in pixels. */
function polyPath(poly, u) {
  const p = new Path2D();
  if (!poly || !poly.length) return p;
  p.moveTo(poly[0][0] * u, poly[0][1] * u);
  for (let i = 1; i < poly.length; i++) p.lineTo(poly[i][0] * u, poly[i][1] * u);
  p.closePath();
  return p;
}
