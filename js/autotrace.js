/* Battlemap Forge — automatic wall tracing.
 *
 * Reads an imported map image and guesses where the walls are. The assumption
 * that makes this work on most published battlemaps: walls are drawn darker
 * than the floor they enclose, and they sit on or near the grid lines. So we
 * sample a strip along every grid line and ask whether it is meaningfully
 * darker than the floor on either side of it.
 *
 * It is a heuristic, not magic — it does well on built structures with dark
 * walls and lit floors, and poorly on caves with no drawn wall at all. It is
 * meant to do the boring 90% so the Partition tool only has to fix the rest.
 */
'use strict';

const TRACE_SS = 10;   // samples per grid square

/** Rasterise the background image onto the current grid alignment. */
function traceSample(map, bg, ss) {
  ss = ss || TRACE_SS;
  const cv = makeCanvas(map.w * ss, map.h * ss);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  const k = ss / bg.ppg;
  ctx.drawImage(bg.img, -bg.offX * k, -bg.offY * k, bg.img.width * k, bg.img.height * k);
  let img;
  try { img = ctx.getImageData(0, 0, cv.width, cv.height); }
  catch (e) { return null; }          // tainted canvas
  const N = cv.width * cv.height;
  const lum = new Float32Array(N);
  const sat = new Float32Array(N);
  const d = img.data;
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    const r = d[p], g = d[p + 1], b = d[p + 2];
    lum[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat[i] = mx ? (mx - mn) / mx : 0;
  }
  return { lum, sat, W: cv.width, H: cv.height, ss };
}

function _mean(S, x0, y0, x1, y1) {
  let s = 0, n = 0;
  const X0 = Math.max(0, x0 | 0), X1 = Math.min(S.W - 1, x1 | 0);
  const Y0 = Math.max(0, y0 | 0), Y1 = Math.min(S.H - 1, y1 | 0);
  for (let y = Y0; y <= Y1; y++) {
    const row = y * S.W;
    for (let x = X0; x <= X1; x++) { s += S.lum[row + x]; n++; }
  }
  return n ? s / n : 0;
}

/** Mean luminance of a cell's core, ignoring the wall bands at its rim. */
function cellLum(S, cx, cy) {
  const ss = S.ss, m = ss * 0.28;
  return _mean(S, cx * ss + m, cy * ss + m, (cx + 1) * ss - m, (cy + 1) * ss - m);
}

/** Darkest band found along a grid line, which is what a wall looks like. */
function edgeLum(S, x, y, dir) {
  const ss = S.ss;
  const band = Math.max(1, Math.round(ss * 0.22));
  const inset = Math.round(ss * 0.12);
  let best = 1;
  // slide the sample band a little: hand-drawn walls rarely sit dead on the line
  for (let off = -1; off <= 1; off++) {
    let v;
    if (dir === 'v') {
      const px = x * ss + off * band;
      v = _mean(S, px - band / 2, y * ss + inset, px + band / 2, (y + 1) * ss - inset);
    } else {
      const py = y * ss + off * band;
      v = _mean(S, x * ss + inset, py - band / 2, (x + 1) * ss - inset, py + band / 2);
    }
    if (v < best) best = v;
  }
  return best;
}

/** Otsu's method — split a histogram into two classes without a magic number. */
function otsu(values) {
  const bins = 64, hist = new Float32Array(bins);
  for (const v of values) hist[clamp(Math.floor(v * bins), 0, bins - 1)]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = -1, lo = bins / 2, hi = bins / 2;
  for (let i = 0; i < bins; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    // An empty gap between two peaks gives an identical score at every bin in
    // the gap. Track the whole plateau and take its middle, otherwise the
    // threshold pins to the bottom of the gap and separates nothing.
    if (between > best) { best = between; lo = hi = i; }
    else if (between === best) { hi = i; }
  }
  return ((lo + hi) / 2) / bins;
}

/**
 * Trace walls from the background image.
 * opts: { sensitivity 0..1, walls, outside, border }
 * Returns a report so the UI can say what it did.
 */
function autoTrace(map, bg, opts) {
  const o = Object.assign({ sensitivity: 0.5, walls: true, outside: true, border: true }, opts || {});
  const S = traceSample(map, bg);
  if (!S) return { ok: false, reason: 'The image could not be read back (browser security).' };

  // per-cell brightness
  const cells = new Float32Array(map.w * map.h);
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) cells[y * map.w + x] = cellLum(S, x, y);

  const floorThr = otsu(Array.from(cells));
  // sensitivity slides how much darker a line must be before it counts
  const contrast = lerp(0.20, 0.035, clamp(o.sensitivity, 0, 1));
  // ...and an absolute ceiling, because furniture outlines are mid-tone while
  // walls are genuinely dark. Without this, every rug border reads as a wall.
  const darkGate = floorThr * lerp(0.5, 2.2, clamp(o.sensitivity, 0, 1));

  let wallCount = 0, outsideCount = 0;
  const isFloor = (x, y) =>
    x >= 0 && y >= 0 && x < map.w && y < map.h && cells[y * map.w + x] >= floorThr * 0.72;

  if (o.outside) {
    // very dark, very flat cells are the empty space around the artwork
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      if (cells[i] < floorThr * 0.42) { map.set(x, y, T.VOID); outsideCount++; }
      else map.set(x, y, T.STONE);
    }
  } else {
    map.fill(T.STONE);
  }

  if (o.walls) {
    for (let i = 0; i < map.hw.length; i++) if (map.hw[i] === EDGE.WALL) map.hw[i] = EDGE.NONE;
    for (let i = 0; i < map.vw.length; i++) if (map.vw[i] === EDGE.WALL) map.vw[i] = EDGE.NONE;

    // vertical lines: between (x-1,y) and (x,y)
    for (let y = 0; y < map.h; y++) {
      for (let x = 1; x < map.w; x++) {
        const a = cells[y * map.w + x - 1], b = cells[y * map.w + x];
        if (!isFloor(x - 1, y) && !isFloor(x, y)) continue;
        const e = edgeLum(S, x, y, 'v');
        if (e < Math.max(a, b) - contrast && e < darkGate) map.setV(x, y, EDGE.WALL);
      }
    }
    // horizontal lines: between (x,y-1) and (x,y)
    for (let y = 1; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const a = cells[(y - 1) * map.w + x], b = cells[y * map.w + x];
        if (!isFloor(x, y - 1) && !isFloor(x, y)) continue;
        const e = edgeLum(S, x, y, 'h');
        if (e < Math.max(a, b) - contrast && e < darkGate) map.setH(x, y, EDGE.WALL);
      }
    }
    dropShortRuns(map, 2);
    traceCleanup(map);
    wallCount = countWallEdges(map);
  }

  // the outer boundary of the drawn area
  if (o.border && o.outside) {
    let added = 0;
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      if (isOpen(map.get(x, y)) === false) continue;
      if (!isOpen(map.get(x - 1, y)) && map.getV(x, y) === EDGE.NONE) { map.setV(x, y, EDGE.WALL); added++; }
      if (!isOpen(map.get(x + 1, y)) && map.getV(x + 1, y) === EDGE.NONE) { map.setV(x + 1, y, EDGE.WALL); added++; }
      if (!isOpen(map.get(x, y - 1)) && map.getH(x, y) === EDGE.NONE) { map.setH(x, y, EDGE.WALL); added++; }
      if (!isOpen(map.get(x, y + 1)) && map.getH(x, y + 1) === EDGE.NONE) { map.setH(x, y + 1, EDGE.WALL); added++; }
    }
    wallCount += added;
  }

  return {
    ok: true, walls: wallCount, outside: outsideCount,
    threshold: +floorThr.toFixed(3)
  };
}

function countWallEdges(map) {
  let n = 0;
  for (let i = 0; i < map.hw.length; i++) if (map.hw[i] === EDGE.WALL) n++;
  for (let i = 0; i < map.vw.length; i++) if (map.vw[i] === EDGE.WALL) n++;
  return n;
}

/**
 * Walls run in straight lines for several squares; a chair back or a rug border
 * does not. Dropping collinear runs shorter than `minRun` removes most of what
 * the luminance test picks up inside a room.
 */
function dropShortRuns(map, minRun) {
  const kill = [];
  for (let x = 0; x <= map.w; x++) {
    let run = [];
    for (let y = 0; y <= map.h; y++) {
      const on = y < map.h && map.getV(x, y) === EDGE.WALL;
      if (on) run.push(y);
      else { if (run.length && run.length < minRun) kill.push(['v', x, run.slice()]); run = []; }
    }
  }
  for (let y = 0; y <= map.h; y++) {
    let run = [];
    for (let x = 0; x <= map.w; x++) {
      const on = x < map.w && map.getH(x, y) === EDGE.WALL;
      if (on) run.push(x);
      else { if (run.length && run.length < minRun) kill.push(['h', y, run.slice()]); run = []; }
    }
  }
  // a short run is still legitimate if it bridges two longer perpendicular runs
  for (const [dir, line, idxs] of kill) {
    for (const i of idxs) {
      const [px, py] = dir === 'v' ? [line, i] : [i, line];
      const perp = dir === 'v'
        ? (map.getH(px - 1, py) === EDGE.WALL || map.getH(px, py) === EDGE.WALL ||
           map.getH(px - 1, py + 1) === EDGE.WALL || map.getH(px, py + 1) === EDGE.WALL)
        : (map.getV(px, py - 1) === EDGE.WALL || map.getV(px, py) === EDGE.WALL ||
           map.getV(px + 1, py - 1) === EDGE.WALL || map.getV(px + 1, py) === EDGE.WALL);
      if (perp) continue;
      if (dir === 'v') map.setV(px, py, EDGE.NONE); else map.setH(px, py, EDGE.NONE);
    }
  }
}

/**
 * Tidy the raw detection: bridge one-square gaps in an otherwise straight run,
 * and drop stubs that connect to nothing. Speckle from floor texture becomes
 * isolated segments, so removing them cleans up most false positives.
 */
function traceCleanup(map) {
  let removed = 0;

  // bridge single gaps along a line
  for (let y = 0; y < map.h; y++)
    for (let x = 1; x < map.w; x++)
      if (map.getV(x, y) === EDGE.NONE &&
        map.getV(x, y - 1) === EDGE.WALL && map.getV(x, y + 1) === EDGE.WALL)
        map.setV(x, y, EDGE.WALL);
  for (let y = 1; y < map.h; y++)
    for (let x = 0; x < map.w; x++)
      if (map.getH(x, y) === EDGE.NONE &&
        map.getH(x - 1, y) === EDGE.WALL && map.getH(x + 1, y) === EDGE.WALL)
        map.setH(x, y, EDGE.WALL);

  // count how many wall edges meet each lattice point
  const deg = (px, py) =>
    (map.getV(px, py) === EDGE.WALL ? 1 : 0) +
    (map.getV(px, py - 1) === EDGE.WALL ? 1 : 0) +
    (map.getH(px, py) === EDGE.WALL ? 1 : 0) +
    (map.getH(px - 1, py) === EDGE.WALL ? 1 : 0);

  // a segment with both ends dangling is noise
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x <= map.w; x++) {
      if (map.getV(x, y) !== EDGE.WALL) continue;
      if (deg(x, y) === 1 && deg(x, y + 1) === 1) { map.setV(x, y, EDGE.NONE); removed++; }
    }
  for (let y = 0; y <= map.h; y++)
    for (let x = 0; x < map.w; x++) {
      if (map.getH(x, y) !== EDGE.WALL) continue;
      if (deg(x, y) === 1 && deg(x + 1, y) === 1) { map.setH(x, y, EDGE.NONE); removed++; }
    }
  return removed;
}

/** Draw traced walls as a translucent overlay so the artwork stays readable. */
function drawTraceOverlay(ctx, map, u) {
  const t = u * WALL_THICKNESS;
  ctx.save();
  ctx.fillStyle = 'rgba(214,64,52,0.5)';
  for (let y = 0; y <= map.h; y++)
    for (let x = 0; x < map.w; x++)
      if (map.getH(x, y) === EDGE.WALL) ctx.fillRect(x * u, y * u - t / 2, u, t);
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x <= map.w; x++)
      if (map.getV(x, y) === EDGE.WALL) ctx.fillRect(x * u - t / 2, y * u, t, u);

  // doorways read as green gaps
  ctx.fillStyle = 'rgba(80,200,120,0.75)';
  for (let y = 0; y <= map.h; y++)
    for (let x = 0; x < map.w; x++)
      if (isEdgeDoor(map.getH(x, y))) ctx.fillRect(x * u + u * 0.15, y * u - t / 2, u * 0.7, t);
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x <= map.w; x++)
      if (isEdgeDoor(map.getV(x, y))) ctx.fillRect(x * u - t / 2, y * u + u * 0.15, t, u * 0.7);

  // cells judged to be outside the map
  ctx.fillStyle = 'rgba(20,24,40,0.45)';
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++)
      if (map.get(x, y) === T.VOID) ctx.fillRect(x * u, y * u, u, u);
  ctx.restore();
}
