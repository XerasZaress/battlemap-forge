/* Battlemap Forge — renderer */
'use strict';

const BASE_RES = 8;            // sub-samples per grid square in the soft base layer
const WALL_THICKNESS = 0.26;   // edge wall band, in grid squares

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

function defaultRenderOpts() {
  return {
    grid: true, gridColor: '#000000', gridAlpha: 0.28, gridWeight: 1,
    gridType: 'square', gridOffX: 0, gridOffY: 0, gridRelief: false,
    atmos: null, labels: true,
    lighting: true, ambient: 0.42, ambientColor: '#0a0e1e', vignette: true,
    roomLighting: true,
    water: { flow: 0.6, speed: 1, phase: 0 },   // phase drives the live animation
    style: 'painted',   // 'clean' | 'painted'
    shadows: true, props: true, doors: true, bgImage: null, ppg: null
  };
}

/* ---------------- soft organic base ---------------- */

function drawBase(ctx, map, u, opts, seed) {
  const lw = map.w * BASE_RES, lh = map.h * BASE_RES;
  const off = makeCanvas(lw, lh);
  const octx = off.getContext('2d');
  const img = octx.createImageData(lw, lh);
  const d = img.data;

  for (let py = 0; py < lh; py++) {
    const gy = (py + 0.5) / BASE_RES;
    for (let px = 0; px < lw; px++) {
      const gx = (px + 0.5) / BASE_RES;
      let t = map.get(Math.floor(gx), Math.floor(gy));
      let mat = MATS[t] || MATS[T.VOID];

      if (mat.organic || mat.liquid) {
        const wx = gx + (fbm(gx * 1.9, gy * 1.9, seed, 3) - 0.5) * 1.5;
        const wy = gy + (fbm(gx * 1.9 + 41, gy * 1.9 + 17, seed + 91, 3) - 0.5) * 1.5;
        const t2 = map.get(Math.floor(wx), Math.floor(wy));
        const m2 = MATS[t2];
        if (m2 && (m2.organic || m2.liquid)) { t = t2; mat = m2; }
      }

      const n = fbm(gx * 2.3, gy * 2.3, seed + mat.id * 97, 4);
      const broad = 0.88 + 0.24 * fbm(gx * 0.22, gy * 0.22, seed + 511, 3);
      const c = shade(mixRGB(mat.c1, mat.c2, n), broad);
      const i = (py * lw + px) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, 0, 0, map.w * u, map.h * u);
}

/* ---------------- moving water ----------------
 * Water reads as flowing because of two scrolling caustic layers at different
 * scales and speeds, plus streaks stretched along the current. The tile is
 * generated once per map and reused, so animating it costs two blits.
 */

const _causticCache = {};
function causticTile(seed, scale) {
  const key = seed + '/' + scale;
  if (_causticCache[key]) return _causticCache[key];
  const N = 256;
  const cv = makeCanvas(N, N);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  const d = img.data;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // ridged noise: the sharp creases are what make caustics read as light
      // focused through a rippling surface rather than as blurry cloud
      const f = 1 - Math.abs(fbm(x * scale, y * scale, seed, 4) - 0.5) * 2;
      const v = Math.pow(clamp(f, 0, 1), 7);
      const i = (y * N + x) * 4;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
      d[i + 3] = v * 190;
    }
  }
  ctx.putImageData(img, 0, 0);
  _causticCache[key] = cv;
  return cv;
}

/** Path covering every liquid cell, used to clip the caustics. */
function waterPath2D(map, u) {
  const p = new Path2D();
  let any = false;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const t = map.get(x, y);
    if (t === T.WATER || t === T.DEEP) { p.rect(x * u, y * u, u, u); any = true; }
  }
  return any ? p : null;
}

/**
 * Draw the scrolling caustics. `phase` advances with time in the editor and is
 * fixed for an export, so a still image still gets the texture.
 */
function drawWaterFlow(ctx, map, u, opts, path) {
  const w = (opts && opts.water) || { flow: 0.6, speed: 1, phase: 0 };
  const p = path || waterPath2D(map, u);
  if (!p) return;
  const seed = hashString(String(map.seed)) & 0xffff;
  const ang = (w.flow || 0) * Math.PI * 2;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const t = w.phase || 0;

  ctx.save();
  ctx.clip(p);
  ctx.globalCompositeOperation = 'lighter';
  // two layers drifting at different rates read as depth in the current
  const layers = [
    { tile: causticTile(seed, 0.055), scale: u * 0.055, speed: 26, alpha: 0.30 },
    { tile: causticTile(seed + 7, 0.11), scale: u * 0.03, speed: 44, alpha: 0.18 }
  ];
  for (const L of layers) {
    const pat = ctx.createPattern(L.tile, 'repeat');
    if (!pat) continue;
    const ox = dx * t * L.speed * (w.speed || 1);
    const oy = dy * t * L.speed * (w.speed || 1);
    ctx.save();
    ctx.globalAlpha = L.alpha;
    ctx.translate(ox % 256, oy % 256);
    ctx.fillStyle = pat;
    ctx.fillRect(-256, -256, map.w * u + 512, map.h * u + 512);
    ctx.restore();
  }
  ctx.restore();
}

/* ---------------- moving lava ----------------
 * Molten rock reads as alive because two things happen at once: a bright
 * network of cracks creeping along the flow, and a darker crust drifting over
 * the top at a different rate, so the glow opens and closes as plates part.
 * Lava is viscous, so everything moves at a fraction of the water speed.
 */

const _lavaCache = {};
function lavaTile(seed, kind) {
  const key = seed + '/' + kind;
  if (_lavaCache[key]) return _lavaCache[key];
  const N = 256;
  const cv = makeCanvas(N, N);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  const d = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    if (kind === 'glow') {
      // ridged noise gives a branching crack network rather than blobs
      const f = 1 - Math.abs(fbm(x * 0.035, y * 0.035, seed, 4) - 0.5) * 2;
      const v = Math.pow(clamp(f, 0, 1), 5);
      d[i] = 255;
      d[i + 1] = 90 + v * 150;
      d[i + 2] = 20 + v * 60;
      d[i + 3] = v * 235;
    } else {
      // plates of cooled crust with thin gaps between them
      const f = fbm(x * 0.026, y * 0.026, seed + 31, 4);
      const plate = clamp((f - 0.36) * 6, 0, 1);
      const shade = 18 + fbm(x * 0.12, y * 0.12, seed + 7, 3) * 26;
      d[i] = shade; d[i + 1] = shade * 0.7; d[i + 2] = shade * 0.6;
      d[i + 3] = plate * 250;
    }
  }
  ctx.putImageData(img, 0, 0);
  _lavaCache[key] = cv;
  return cv;
}

function lavaPath2D(map, u) {
  const p = new Path2D();
  let any = false;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++)
    if (map.get(x, y) === T.LAVA) { p.rect(x * u, y * u, u, u); any = true; }
  return any ? p : null;
}

function drawLavaFlow(ctx, map, u, opts, path) {
  const w = (opts && opts.water) || { flow: 0.6, speed: 1, phase: 0 };
  const p = path || lavaPath2D(map, u);
  if (!p) return;
  const seed = hashString(String(map.seed)) & 0xffff;
  const ang = (w.flow || 0) * Math.PI * 2;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const t = (w.phase || 0) * (w.speed === undefined ? 1 : w.speed);

  ctx.save();
  ctx.clip(p);

  // the molten network underneath, breathing slightly
  const pulse = 0.78 + 0.22 * Math.sin(t * 1.1);
  const glow = ctx.createPattern(lavaTile(seed, 'glow'), 'repeat');
  if (glow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.42 * pulse;
    ctx.translate((dx * t * 9) % 256, (dy * t * 9) % 256);
    ctx.fillStyle = glow;
    ctx.fillRect(-256, -256, map.w * u + 512, map.h * u + 512);
    ctx.restore();
  }
  // crust drifting over it a little slower, so cracks open and close
  const crust = ctx.createPattern(lavaTile(seed + 13, 'crust'), 'repeat');
  if (crust) {
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.translate((dx * t * 5.5) % 256, (dy * t * 5.5) % 256);
    ctx.fillStyle = crust;
    ctx.fillRect(-256, -256, map.w * u + 512, map.h * u + 512);
    ctx.restore();
  }
  // a second, faster glow pass through the gaps gives the sense of depth
  if (glow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.26 * pulse;
    ctx.translate((dx * t * 15 + 90) % 256, (dy * t * 15 + 40) % 256);
    ctx.fillStyle = glow;
    ctx.fillRect(-256, -256, map.w * u + 512, map.h * u + 512);
    ctx.restore();
  }
  ctx.restore();
}

/* ---------------- crisp per-tile detail ---------------- */

function drawTileDetail(ctx, map, u, seed, roomIds, waterFlow) {
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const t = map.get(x, y);
      const mat = MATS[t];
      if (!mat || mat.wall) continue;
      const px = x * u, py = y * u;
      const r = (k) => hash2(x * 73 + k, y * 131 + k * 17, seed);
      // boards run one way per room, the way a real floor is laid
      const room = roomIds ? roomIds[y * map.w + x] : 0;
      const acrossRoom = room ? (hash2(room, 7, seed) > 0.5) : false;
      switch (mat.detail) {
        case 'flagstone': flagstone(ctx, px, py, u, mat, r); break;
        case 'cobble': cobble(ctx, px, py, u, mat, r); break;
        case 'planks': planks(ctx, px, py, u, mat, r, x, y, acrossRoom); break;
        case 'weave': weave(ctx, px, py, u, mat, r); break;
        case 'grass': grassTufts(ctx, px, py, u, mat, r); break;
        case 'water': waterDetail(ctx, map, x, y, px, py, u, mat, r, waterFlow); break;
        case 'lava': lavaDetail(ctx, px, py, u, r); break;
        case 'chasm': break; // drawn as a mass in drawChasms
        case 'ice': iceDetail(ctx, px, py, u, r); break;
        case 'rubble': rubbleDetail(ctx, px, py, u, r); break;
        case 'speckle': speckle(ctx, px, py, u, mat, r); break;
        case 'sky': skyDetail(ctx, px, py, u, x, y, seed); break;
        case 'cloudy': cloudDetail(ctx, px, py, u, x, y, seed); break;
      }
      if (t === T.VOID) { ctx.fillStyle = '#0c0d12'; ctx.fillRect(px, py, u, u); }
    }
  }
}

function flagstone(ctx, px, py, u, mat, r) {
  ctx.fillStyle = rgb(shade(mat.c1, 0.62));
  ctx.fillRect(px, py, u, u);
  const n = 2, g = u * 0.045;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    const jx = (r(k) - 0.5) * u * 0.05, jy = (r(k + 9) - 0.5) * u * 0.05;
    const sx = px + (i * u) / n + g / 2 + jx, sy = py + (j * u) / n + g / 2 + jy;
    const sw = u / n - g, sh = u / n - g;
    ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, u * 0.03);
    ctx.fillStyle = rgb(mixRGB(mat.c1, mat.c2, 0.25 + r(k + 3) * 0.75));
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = u * 0.012; ctx.stroke();
  }
}

function cobble(ctx, px, py, u, mat, r) {
  ctx.fillStyle = rgb(shade(mat.c1, 0.55));
  ctx.fillRect(px, py, u, u);
  const n = 3;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    const cx = px + (i + 0.5) * u / n + (r(k) - 0.5) * u * 0.08;
    const cy = py + (j + 0.5) * u / n + (r(k + 5) - 0.5) * u * 0.08;
    const rad = (u / n) * (0.36 + r(k + 11) * 0.14);
    ctx.beginPath(); ctx.ellipse(cx, cy, rad, rad * (0.82 + r(k + 2) * 0.3), r(k + 7) * 3, 0, Math.PI * 2);
    ctx.fillStyle = rgb(mixRGB(mat.c1, mat.c2, 0.2 + r(k + 13) * 0.8));
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = u * 0.012; ctx.stroke();
  }
}

function planks(ctx, px, py, u, mat, r, gx, gy, across) {
  if (across) {
    // same boards, laid at right angles: rotate the tile about its centre
    ctx.save();
    ctx.translate(px + u / 2, py + u / 2);
    ctx.rotate(Math.PI / 2);
    ctx.translate(-u / 2, -u / 2);
    planks(ctx, 0, 0, u, mat, r, gy, gx, false);
    ctx.restore();
    return;
  }
  const rows = 2, ph = u / rows;
  for (let j = 0; j < rows; j++) {
    const y = py + j * ph;
    ctx.fillStyle = rgb(mixRGB(mat.c1, mat.c2, 0.25 + hash2(gx, gy * rows + j, 55) * 0.75));
    ctx.fillRect(px, y, u, ph);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = u * 0.018;
    ctx.beginPath(); ctx.moveTo(px, y + 0.5); ctx.lineTo(px + u, y + 0.5); ctx.stroke();
    // stagger a butt joint
    if (hash2(gx * 3 + j, gy * 7, 91) > 0.72) {
      const bx = px + u * (0.25 + r(j) * 0.5);
      ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx, y + ph); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (const nx of [px + u * 0.12, px + u * 0.88]) ctx.fillRect(nx, y + ph * 0.45, u * 0.025, u * 0.025);
  }
}

function weave(ctx, px, py, u, mat, r) {
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = u * 0.015;
  ctx.beginPath();
  for (let i = 1; i < 5; i++) {
    ctx.moveTo(px + (u * i) / 5, py); ctx.lineTo(px + (u * i) / 5, py + u);
    ctx.moveTo(px, py + (u * i) / 5); ctx.lineTo(px + u, py + (u * i) / 5);
  }
  ctx.stroke();
}

function grassTufts(ctx, px, py, u, mat, r) {
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const x = px + r(i) * u, y = py + r(i + 20) * u;
    const h = u * (0.09 + r(i + 40) * 0.11);
    const lean = (r(i + 60) - 0.5) * u * 0.1;
    ctx.strokeStyle = rgba(r(i + 5) > 0.5 ? shade(mat.c2, 1.15) : shade(mat.c1, 0.8), 0.55);
    ctx.lineWidth = u * 0.022;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.5, y - h * 0.6, x + lean, y - h);
    ctx.stroke();
  }
}

function waterDetail(ctx, map, gx, gy, px, py, u, mat, r, flow) {
  // surface streaks stretched along the current
  const ang = (flow === undefined ? 0.6 : flow) * Math.PI * 2;
  const fx = Math.cos(ang), fy = Math.sin(ang);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = u * 0.028; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const cx = px + u * (0.15 + r(i) * 0.7);
    const cy = py + u * (0.15 + r(i + 11) * 0.7);
    const len = u * (0.18 + r(i + 7) * 0.4);
    const bow = u * 0.06 * (r(i + 19) - 0.5);
    ctx.beginPath();
    ctx.moveTo(cx - fx * len / 2, cy - fy * len / 2);
    ctx.quadraticCurveTo(cx - fy * bow, cy + fx * bow, cx + fx * len / 2, cy + fy * len / 2);
    ctx.stroke();
  }
  // shoreline foam
  const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of nb) {
    const t = map.get(gx + dx, gy + dy);
    if (t === T.WATER || t === T.DEEP || !MATS[t]) continue;
    if (MATS[t].liquid) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = u * 0.07;
    ctx.beginPath();
    if (dx === 1) { ctx.moveTo(px + u, py); ctx.lineTo(px + u, py + u); }
    else if (dx === -1) { ctx.moveTo(px, py); ctx.lineTo(px, py + u); }
    else if (dy === 1) { ctx.moveTo(px, py + u); ctx.lineTo(px + u, py + u); }
    else { ctx.moveTo(px, py); ctx.lineTo(px + u, py); }
    ctx.stroke();
  }
}

function lavaDetail(ctx, px, py, u, r) {
  for (let i = 0; i < 3; i++) {
    const cx = px + r(i) * u, cy = py + r(i + 9) * u;
    ctx.beginPath();
    ctx.ellipse(cx, cy, u * (0.12 + r(i + 3) * 0.2), u * (0.09 + r(i + 5) * 0.14), r(i + 7) * 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40,18,12,0.6)'; ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,220,120,0.5)'; ctx.lineWidth = u * 0.03;
  ctx.beginPath();
  ctx.moveTo(px + r(2) * u, py);
  ctx.quadraticCurveTo(px + u * 0.5, py + u * 0.5, px + r(4) * u, py + u);
  ctx.stroke();
}

function chasmDetail(ctx, map, gx, gy, px, py, u, r) {
  let open = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
    if (map.get(gx + dx, gy + dy) !== T.CHASM) open++;
  const depth = clamp(1 - open / 6, 0, 1);
  ctx.fillStyle = `rgba(0,0,0,${0.2 + depth * 0.45})`;
  ctx.fillRect(px, py, u, u);
  if (open > 0) {
    // lip of the crack: broken rock catching the light
    ctx.strokeStyle = 'rgba(165,160,150,0.3)'; ctx.lineWidth = u * 0.06;
    ctx.strokeRect(px + u * 0.03, py + u * 0.03, u * 0.94, u * 0.94);
    for (let i = 0; i < 3; i++) {
      const cx = px + r(i) * u, cy = py + r(i + 17) * u;
      ctx.beginPath();
      ctx.ellipse(cx, cy, u * (0.05 + r(i + 4) * 0.07), u * 0.05, r(i + 8) * 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120,116,108,0.3)'; ctx.fill();
    }
  }
}

function iceDetail(ctx, px, py, u, r) {
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = u * 0.02;
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.moveTo(px + r(i) * u, py + r(i + 4) * u);
    ctx.lineTo(px + r(i + 8) * u, py + r(i + 12) * u);
    ctx.stroke();
  }
}

function rubbleDetail(ctx, px, py, u, r) {
  for (let i = 0; i < 9; i++) {
    const cx = px + r(i) * u, cy = py + r(i + 30) * u;
    const s = u * (0.03 + r(i + 60) * 0.06);
    ctx.beginPath(); ctx.ellipse(cx, cy, s, s * 0.8, r(i + 12) * 3, 0, Math.PI * 2);
    ctx.fillStyle = r(i + 2) > 0.5 ? 'rgba(30,28,24,0.5)' : 'rgba(200,195,185,0.22)';
    ctx.fill();
  }
}

/* Open air: faint high wisps, nothing solid to stand on. */
function skyDetail(ctx, px, py, u, gx, gy, seed) {
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = u * 0.05;
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const v = fbm(gx * 0.7 + i * 3.1, gy * 0.7, seed + 220, 2);
    if (v < 0.45) continue;
    const y = py + u * (0.2 + hash2(gx, gy * 3 + i, seed) * 0.6);
    const x = px + u * hash2(gx + i, gy, seed + 9) * 0.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + u * 0.35, y - u * 0.06, x + u * 0.7, y);
    ctx.stroke();
  }
}

/* Cloud banks: soft puffs with feathered edges, so a bank reads as vapour
   rather than a row of circles. */
function cloudDetail(ctx, px, py, u, gx, gy, seed) {
  for (let i = 0; i < 5; i++) {
    const cx = px + u * hash2(gx * 5 + i, gy * 7, seed);
    const cy = py + u * hash2(gx * 3, gy * 11 + i, seed + 4);
    const r = u * (0.28 + hash2(gx + i, gy + i, seed + 8) * 0.5);
    const bright = i % 2 === 0;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, bright ? 'rgba(255,255,255,0.30)' : 'rgba(178,196,217,0.24)');
    g.addColorStop(0.55, bright ? 'rgba(255,255,255,0.14)' : 'rgba(178,196,217,0.10)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
}

function speckle(ctx, px, py, u, mat, r) {
  for (let i = 0; i < 8; i++) {
    const cx = px + r(i) * u, cy = py + r(i + 25) * u;
    const s = u * (0.015 + r(i + 50) * 0.03);
    ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI * 2);
    ctx.fillStyle = r(i + 3) > 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.12)';
    ctx.fill();
  }
}

/* ---------------- walls ---------------- */

const isRoughWall = (t) => isWallTile(t) && MATS[t].detail === 'rough';
const isBuiltWall = (t) => isWallTile(t) && MATS[t].detail !== 'rough';

function wallPath(ctx, map, u) {
  ctx.beginPath();
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++)
    if (isBuiltWall(map.get(x, y))) ctx.rect(x * u, y * u, u, u);
}

/* Natural formations get a blobby silhouette instead of square tiles: the union
   of rounded tiles becomes a mask, the texture is clipped to it, and a dilated
   copy of the mask underneath supplies the outline or rim. */
function blobMask(map, u, cells, seed, radius) {
  const mask = makeCanvas(map.w * u, map.h * u);
  const mctx = mask.getContext('2d');
  mctx.fillStyle = '#000';
  for (const [x, y] of cells) {
    const pad = u * 0.07;
    const wob = (hash2(x, y, seed) - 0.5) * u * 0.06;
    mctx.beginPath();
    mctx.roundRect(x * u - pad + wob, y * u - pad - wob, u + pad * 2, u + pad * 2, u * (radius || 0.36));
    mctx.fill();
  }
  return mask;
}

function dilate(ctx, mask, k) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]])
    ctx.drawImage(mask, dx * k, dy * k);
}

function collectCells(map, pred) {
  const out = [];
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const t = map.get(x, y);
    if (pred(t)) out.push([x, y, t]);
  }
  return out;
}

function drawRockMasses(ctx, map, u, opts, seed) {
  const cells = collectCells(map, isRoughWall);
  if (!cells.length) return;
  const mask = blobMask(map, u, cells, seed);

  const layer = makeCanvas(map.w * u, map.h * u);
  const lctx = layer.getContext('2d');
  for (const [x, y, t] of cells) {
    const mat = MATS[t], px = x * u, py = y * u;
    const r = (k) => hash2(x * 91 + k, y * 57 + k * 13, seed);
    lctx.fillStyle = rgb(mixRGB(mat.c1, mat.c2, 0.3 + r(1) * 0.4));
    lctx.fillRect(px - u * 0.2, py - u * 0.2, u * 1.4, u * 1.4);
    roughDetail(lctx, px, py, u, mat, r);
  }
  lctx.globalCompositeOperation = 'destination-in';
  lctx.drawImage(mask, 0, 0);

  if (opts.shadows) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = u * 0.4;
    ctx.shadowOffsetX = u * 0.07;
    ctx.shadowOffsetY = u * 0.1;
    ctx.drawImage(mask, 0, 0);
    ctx.restore();
  }
  dilate(ctx, mask, Math.max(1, u * 0.055));
  ctx.drawImage(layer, 0, 0);
}

/* Pits and crevasses: a pale broken-rock lip around a dark, receding interior. */
function drawChasms(ctx, map, u, opts, seed) {
  const cells = collectCells(map, t => t === T.CHASM);
  if (!cells.length) return;
  const mask = blobMask(map, u, cells, seed, 0.3);
  const W = map.w * u, H = map.h * u;

  // pale lip
  const lip = makeCanvas(W, H);
  const pctx = lip.getContext('2d');
  dilate(pctx, mask, Math.max(1, u * 0.1));
  pctx.globalCompositeOperation = 'source-in';
  for (const [x, y] of cells) {
    const r = (k) => hash2(x * 31 + k, y * 17 + k * 7, seed);
    pctx.fillStyle = rgb(mixRGB([116, 118, 124], [168, 172, 180], r(1)));
    pctx.fillRect(x * u - u * 0.5, y * u - u * 0.5, u * 2, u * 2);
  }
  ctx.drawImage(lip, 0, 0);

  // dark interior
  const inner = makeCanvas(W, H);
  const ictx = inner.getContext('2d');
  ictx.drawImage(mask, 0, 0);
  ictx.globalCompositeOperation = 'source-in';
  for (const [x, y] of cells) {
    let open = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      if (map.get(x + dx, y + dy) !== T.CHASM) open++;
    const depth = clamp(1 - open / 6, 0, 1);
    ictx.fillStyle = rgb(mixRGB([46, 50, 62], [8, 9, 14], depth));
    ictx.fillRect(x * u - 1, y * u - 1, u + 2, u + 2);
  }
  ctx.drawImage(inner, 0, 0);
}

function drawWalls(ctx, map, u, opts, seed) {
  drawChasms(ctx, map, u, opts, seed);
  drawRockMasses(ctx, map, u, opts, seed);

  let any = false;
  for (let i = 0; i < map.cells.length; i++) if (isBuiltWall(map.cells[i])) { any = true; break; }
  if (!any) return;

  if (opts.shadows) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = u * 0.42;
    ctx.shadowOffsetX = u * 0.07;
    ctx.shadowOffsetY = u * 0.1;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    wallPath(ctx, map, u);
    ctx.fill();
    ctx.restore();
  }

  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const t = map.get(x, y);
    if (!isBuiltWall(t)) continue;
    const mat = MATS[t], px = x * u, py = y * u;
    const r = (k) => hash2(x * 91 + k, y * 57 + k * 13, seed);
    ctx.fillStyle = rgb(mixRGB(mat.c1, mat.c2, 0.3 + r(1) * 0.4));
    ctx.fillRect(px, py, u, u);
    if (mat.detail === 'brick') brickDetail(ctx, px, py, u, mat, x, y, seed);
    else timberDetail(ctx, px, py, u, mat, r);
  }

  // crisp outline + top highlight where wall meets open space
  ctx.lineWidth = Math.max(1, u * 0.045);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (!isBuiltWall(map.get(x, y))) continue;
    const px = x * u, py = y * u;
    if (!isWallTile(map.get(x, y - 1))) { ctx.moveTo(px, py); ctx.lineTo(px + u, py); }
    if (!isWallTile(map.get(x, y + 1))) { ctx.moveTo(px, py + u); ctx.lineTo(px + u, py + u); }
    if (!isWallTile(map.get(x - 1, y))) { ctx.moveTo(px, py); ctx.lineTo(px, py + u); }
    if (!isWallTile(map.get(x + 1, y))) { ctx.moveTo(px + u, py); ctx.lineTo(px + u, py + u); }
  }
  ctx.stroke();

  ctx.lineWidth = Math.max(1, u * 0.05);
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.beginPath();
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (!isBuiltWall(map.get(x, y))) continue;
    if (!isWallTile(map.get(x, y - 1))) { ctx.moveTo(x * u, y * u + u * 0.05); ctx.lineTo(x * u + u, y * u + u * 0.05); }
  }
  ctx.stroke();
}

function brickDetail(ctx, px, py, u, mat, gx, gy, seed) {
  const rows = 2, bh = u / rows;
  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.lineWidth = u * 0.022;
  for (let j = 0; j < rows; j++) {
    const y = py + j * bh;
    const offset = ((gy * rows + j) % 2) * u * 0.5;
    ctx.fillStyle = rgb(mixRGB(mat.c1, mat.c2, 0.2 + hash2(gx * 5 + j, gy * 11, seed) * 0.7));
    ctx.fillRect(px, y, u, bh);
    ctx.beginPath();
    ctx.moveTo(px, y + 0.5); ctx.lineTo(px + u, y + 0.5);
    const jx = px + offset;
    ctx.moveTo(jx, y); ctx.lineTo(jx, y + bh);
    if (offset > 0) { ctx.moveTo(px, y); ctx.lineTo(px, y + bh); }
    ctx.stroke();
  }
}

function timberDetail(ctx, px, py, u, mat, r) {
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = u * 0.025;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) { ctx.moveTo(px + (u * i) / 4, py); ctx.lineTo(px + (u * i) / 4, py + u); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = u * 0.03;
  ctx.beginPath(); ctx.moveTo(px, py + u * 0.5); ctx.lineTo(px + u, py + u * 0.5); ctx.stroke();
}

function roughDetail(ctx, px, py, u, mat, r) {
  for (let i = 0; i < 5; i++) {
    const cx = px + r(i) * u, cy = py + r(i + 15) * u;
    ctx.beginPath();
    ctx.ellipse(cx, cy, u * (0.1 + r(i + 5) * 0.16), u * (0.08 + r(i + 8) * 0.13), r(i + 3) * 3, 0, Math.PI * 2);
    ctx.fillStyle = r(i + 2) > 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.07)';
    ctx.fill();
  }
}

/* ---------------- rooms ---------------- */

/** Flood-fill open cells into rooms. Edge walls AND edge doors both bound a
    room, so a doorway separates two lit spaces rather than merging them. */
function findRooms(map) {
  const W = map.w, H = map.h;
  const seen = new Uint8Array(W * H);
  const rooms = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (seen[i] || !isOpen(map.cells[i])) continue;
    const stack = [[x, y]], cells = [];
    seen[i] = 1;
    let sx = 0, sy = 0, x0 = x, x1 = x, y0 = y, y1 = y;
    // A space is only "enclosed" if it never spills off the edge of the map
    // through an unwalled boundary — otherwise it is outdoors.
    let enclosed = true;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      cells.push(cy * W + cx);
      sx += cx + 0.5; sy += cy + 0.5;
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      const nb = [
        [cx + 1, cy, map.getV(cx + 1, cy)],
        [cx - 1, cy, map.getV(cx, cy)],
        [cx, cy + 1, map.getH(cx, cy + 1)],
        [cx, cy - 1, map.getH(cx, cy)]
      ];
      for (const [nx, ny, edge] of nb) {
        if (edge !== EDGE.NONE) continue;
        if (!map.inBounds(nx, ny)) { enclosed = false; continue; }
        const ni = ny * W + nx;
        if (seen[ni] || !isOpen(map.cells[ni])) continue;
        seen[ni] = 1; stack.push([nx, ny]);
      }
    }
    rooms.push({
      cells, area: cells.length, cx: sx / cells.length, cy: sy / cells.length,
      x0, y0, x1, y1, enclosed
    });
  }
  return rooms;
}

/** Per-cell room index, 0 = none. Lets floor detail vary between rooms. */
/**
 * A stable key per room, used for things that should look the same every time
 * — floorboard direction, for instance.
 *
 * It is derived from where the room *is*, not from the order rooms happen to
 * be discovered in. Scan order shifts the moment a room is added anywhere
 * above or left of an existing one, which would silently re-roll the look of
 * every room after it.
 */
function roomKeyOf(r) {
  const h = (Math.imul(r.x0 + 1, 73856093) ^ Math.imul(r.y0 + 1, 19349663)) >>> 0;
  return 1 + (h % 65500);
}

function roomIndexMap(map, rooms) {
  const ids = new Uint16Array(map.w * map.h);
  for (const r of rooms) {
    const key = roomKeyOf(r);
    for (const c of r.cells) ids[c] = key;
  }
  return ids;
}

function roomPath(ctx, room, map, u) {
  ctx.beginPath();
  for (const c of room.cells) {
    const x = c % map.w, y = (c / map.w) | 0;
    ctx.rect(x * u, y * u, u, u);
  }
}

/* ---------------- edge walls ---------------- */

/** Thin partitions drawn as a heavy band straddling the line between cells. */
function drawEdgeWalls(ctx, map, u, opts, seed) {
  const runs = extractEdgeWalls(map);
  const doors = edgePortals(map);
  if (!runs.length && !doors.length) return;

  const t = u * WALL_THICKNESS * (opts.style === 'painted' ? 1.15 : 1);
  const strokeRuns = (width, style, shadow) => {
    if (!runs.length) return;
    ctx.save();
    if (shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = u * 0.3;
      ctx.shadowOffsetY = u * 0.06;
    }
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const r of runs) {
      ctx.moveTo(r[0][0] * u, r[0][1] * u);
      ctx.lineTo(r[1][0] * u, r[1][1] * u);
    }
    ctx.stroke();
    ctx.restore();
  };

  strokeRuns(t, '#1b1610', true);          // dark mass, casting onto the floor
  strokeRuns(t * 0.58, '#4a4033', false);  // lit core
  ctx.save();
  ctx.globalAlpha = 0.5;
  strokeRuns(t * 0.2, '#6b6053', false);   // highlight along the crown
  ctx.restore();

  for (const d of doors) {
    const horiz = d.y0 === d.y1;
    ctx.save();
    ctx.translate(d.cx * u, d.cy * u);
    if (!horiz) ctx.rotate(Math.PI / 2);
    const len = u * 0.86, th = t * 0.92;
    // jambs either side of the opening
    ctx.fillStyle = '#1b1610';
    ctx.fillRect(-u * 0.5, -th / 2, u * 0.5 - len / 2, th);
    ctx.fillRect(len / 2, -th / 2, u * 0.5 - len / 2, th);
    if (d.secret) {
      ctx.fillStyle = '#241d15';
      ctx.fillRect(-len / 2, -th / 2, len, th);
      ctx.strokeStyle = 'rgba(190,120,110,0.5)';
      ctx.lineWidth = u * 0.02;
      ctx.strokeRect(-len / 2, -th / 2, len, th);
    } else {
      ctx.beginPath();
      ctx.roundRect(-len / 2, -th * 0.42, len, th * 0.84, u * 0.02);
      ctx.fillStyle = '#7a5433';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = u * 0.025;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = u * 0.015;
      ctx.beginPath();
      ctx.moveTo(-len * 0.16, -th * 0.42); ctx.lineTo(-len * 0.16, th * 0.42);
      ctx.moveTo(len * 0.16, -th * 0.42); ctx.lineTo(len * 0.16, th * 0.42);
      ctx.stroke();
      ctx.fillStyle = '#c9a227';
      ctx.beginPath(); ctx.arc(len * 0.3, 0, u * 0.028, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

/* ---------------- props & doors ---------------- */

function drawProps(ctx, map, u, opts) {
  drawPropList(ctx, map, u, opts, map.props.filter(p => !propIsSunk(map, p)));
}

/** A prop only sinks where there is something to sink into: carry the flag on
    one dragged out of the pool, but draw it like anything else on dry ground. */
function propIsSunk(map, p) {
  if (!p.sunk) return false;
  const t = map.get(Math.floor(p.x), Math.floor(p.y));
  return !!(MATS[t] && MATS[t].liquid);
}

/**
 * Props the user has sunk into the liquid they stand in.
 *
 * They are drawn before the caustics rather than after, so the water moves over
 * them, and veiled in the colour of that liquid so depth reads — a chest under
 * deep water should not look like a chest sitting on it.
 */
function drawSunkProps(ctx, map, u, opts, list) {
  const from = list || map.props;
  const sunk = from.filter(p => PROPS[p.type] && propIsSunk(map, p));
  if (!sunk.length) return;
  // one veil pass per liquid, rather than one canvas per prop
  const groups = new Map();
  for (const p of sunk) {
    const t = map.get(Math.floor(p.x), Math.floor(p.y));
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(p);
  }
  for (const [t, list] of groups) {
    const layer = makeCanvas(map.w * u, map.h * u);
    const lc = layer.getContext('2d');
    drawPropList(lc, map, u, opts, list);
    const m = MATS[t];
    lc.globalCompositeOperation = 'source-atop';
    lc.fillStyle = `rgba(${m.c1[0]},${m.c1[1]},${m.c1[2]},${SUNK_VEIL[t] || 0.34})`;
    lc.fillRect(0, 0, map.w * u, map.h * u);
    ctx.drawImage(layer, 0, 0);
  }
}

/** How much of the liquid stands between the viewer and a sunk prop. */
const SUNK_VEIL = { [T.WATER]: 0.3, [T.DEEP]: 0.55, [T.LAVA]: 0.62 };

/** The prop's own artwork, drawn as vectors — still, deliberately, rather than
 *  blitted from the cached raster, so it stays exactly as sharp at 140 px per
 *  square as it ever was. The raster only ever supplies shading underneath. */
function drawPropArt(ctx, u, p, def, seed) {
  // Every prop on the map shares this one context, so a draw function that
  // leaves a save() unbalanced would shift everything drawn after it. Pinning
  // the transform back keeps one prop's mistake to itself.
  const t = ctx.getTransform();
  ctx.save();
  ctx.translate(p.x * u, p.y * u);
  ctx.rotate(p.rot || 0);
  const sc = p.scale || 1;
  const wd = (p.width === undefined ? 1 : p.width) * (p.mirror ? -1 : 1);
  const ht = p.height === undefined ? 1 : p.height;
  ctx.scale(sc * wd, sc * ht);
  def.draw(ctx, u, seededFn(seed));
  ctx.restore();
  ctx.setTransform(t);
}

/**
 * Props go down in three passes rather than one prop at a time, for two
 * reasons. Flat props have to be laid before any shading so that a barrel's
 * shadow falls *across* the rug rather than under it. And doing all the shading
 * together, then all the artwork, keeps the renderer from flipping canvas state
 * hundreds of times a frame, which on a crowded map is most of the cost.
 */
function drawPropList(ctx, map, u, opts, props) {
  const flat = [], standing = [];
  for (const p of props) {
    // the family knows several forms of itself; resolve to the one this prop
    // wears before anything reads its height or caches its silhouette
    const def = propDefFor(PROPS[p.type], p.vi);
    if (!def) continue;
    // props saved before seeds were stored fall back to the old position-derived
    // roll, so an existing map looks exactly as it did
    const entry = { p, def, seed: p.sd === undefined ? Math.round(p.x * 977 + p.y * 331) : p.sd };
    // `under` is the flat set, not "anything with no height" — a map marker has
    // no height either, and it belongs on top of the furniture, not beneath it.
    (def.under ? flat : standing).push(entry);
  }
  // Nearer things last, so a prop overlaps the one behind it.
  standing.sort((a, b) => a.p.y - b.p.y);

  for (const e of flat) drawPropArt(ctx, u, e.p, e.def, e.seed);
  if (opts.shadows) {
    for (const e of standing) drawPropGrounding(ctx, map, u, e.p, e.def, e.seed);
  }
  for (const e of standing) drawPropArt(ctx, u, e.p, e.def, e.seed);
}

/**
 * Everything that makes a prop sit on the floor rather than float above it:
 * its cast shadow, the sliver of its own side, and the contact darkening where
 * it meets the ground. All three come from one cached silhouette of the prop —
 * see js/shading.js — so a bookshelf casts one shadow rather than one per book.
 *
 * How far each cue reaches is driven entirely by the prop's declared height, so
 * an obelisk throws a long soft shadow and a stool throws a short crisp one
 * without either of them having to say anything beyond how tall it is.
 */
function drawPropGrounding(ctx, map, u, p, def, seed) {
  if (propHeight(def) <= 0) return;                 // rugs and circles lie flat

  const beneath = map.get(Math.floor(p.x), Math.floor(p.y));
  const onLiquid = MATS[beneath] && MATS[beneath].liquid;
  const sprite = propSprite(def, spriteRes(def, u), seed);
  const sh = propShadow(def);

  // A cast shadow is lost in moving caustics, and a submerged prop has no
  // business throwing one at all — in both cases the contact shading carries
  // the weight instead, and carries it a little harder to compensate.
  const casts = sh && sprite.shadow && !onLiquid && !p.sunk;
  if (casts) {
    ctx.save();
    // These rasters are already blurred, so interpolating them on the way in
    // buys nothing and costs a good deal on a map with hundreds of props.
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = sh.alpha;
    blitPropRaster(ctx, sprite.shadow, sprite, p, u, sh.dx * u, sh.dy * u);
    ctx.restore();
  }

  if (sprite.ao) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = casts ? AO_ALPHA : AO_ALPHA * 1.45;
    blitPropRaster(ctx, sprite.ao, sprite, p, u, 0, 0);
    ctx.restore();
  }

  // The side face: the same artwork, darkened, peeking out on the shadow side.
  // It has to be blitted rather than baked into the prop, because the sun must
  // not turn when the prop does.
  if (sprite.side && !p.sunk) {
    const reach = propHeight(def) * SIDE_LENGTH * u;
    blitPropRaster(ctx, sprite.side, sprite, p, u, SUN.x * reach, SUN.y * reach);
  }
}

function drawDoors(ctx, map, u) {
  for (const d of map.doors) {
    const px = d.x * u, py = d.y * u;
    ctx.save();
    ctx.translate(px + u / 2, py + u / 2);
    if (d.dir === 'h') ctx.rotate(Math.PI / 2);
    // jambs
    ctx.fillStyle = '#4a463f';
    ctx.fillRect(-u * 0.13, -u * 0.5, u * 0.26, u * 0.1);
    ctx.fillRect(-u * 0.13, u * 0.4, u * 0.26, u * 0.1);
    // leaf
    const w = u * 0.2, h = u * 0.86;
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, u * 0.03);
    ctx.fillStyle = d.secret ? '#4a463f' : '#6b4a2b';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = u * 0.03; ctx.stroke();
    if (!d.secret) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = u * 0.02;
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h * 0.25); ctx.lineTo(w / 2, -h * 0.25);
      ctx.moveTo(-w / 2, h * 0.25); ctx.lineTo(w / 2, h * 0.25);
      ctx.stroke();
      ctx.fillStyle = '#c9a227';
      ctx.beginPath(); ctx.arc(0, h * 0.06, u * 0.035, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

/* ---------------- lighting ---------------- */

/** A warm pool per enclosed room, falling off toward that room's own walls.
    This is what makes an interior read as lit from within rather than as a
    floor plan under a single global lamp. */
function roomPools(map, rooms) {
  // Deliberately not gated on whether the map contains partitions: a room is
  // lit because it is an enclosed space, however it came to be enclosed. The
  // old check meant a dungeon walled entirely in solid rock had no interior
  // lighting at all until the first prefab arrived, at which point every room
  // on the map lit up at once.
  if (!rooms) return [];
  const limit = Math.max(80, map.w * map.h * 0.24);
  return rooms.filter(r => r.enclosed && r.area >= 2 && r.area <= limit).map(r => ({
    room: r,
    radius: Math.max(1.2, Math.sqrt(r.area) * 0.78),
    cx: r.cx, cy: r.cy
  }));
}

function drawLighting(ctx, map, u, opts, rooms, shadows, propMask) {
  const W = map.w * u, H = map.h * u;
  const pools = opts.roomLighting === false ? [] : roomPools(map, rooms);
  const ov = makeCanvas(W, H);
  const o = ov.getContext('2d');
  o.fillStyle = opts.ambientColor;
  o.globalAlpha = opts.ambient;
  o.fillRect(0, 0, W, H);
  o.globalAlpha = 1;

  o.globalCompositeOperation = 'destination-out';
  for (const p of pools) {
    o.save();
    roomPath(o, p.room, map, u);
    o.clip();
    const r = p.radius * u;
    const g = o.createRadialGradient(p.cx * u, p.cy * u, r * 0.1, p.cx * u, p.cy * u, r);
    g.addColorStop(0, 'rgba(0,0,0,0.94)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.72)');
    g.addColorStop(1, 'rgba(0,0,0,0.12)');
    o.fillStyle = g;
    o.fillRect(p.room.x0 * u, p.room.y0 * u, (p.room.x1 - p.room.x0 + 1) * u, (p.room.y1 - p.room.y0 + 1) * u);
    o.restore();
  }
  map.lights.forEach((L, i) => {
    const r = Math.max(u * 0.6, L.range * u);
    const g = o.createRadialGradient(L.x * u, L.y * u, r * 0.05, L.x * u, L.y * u, r);
    const a = clamp(L.intensity ?? 1, 0, 1);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(0.45, `rgba(0,0,0,${a * 0.8})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    o.save();
    // clip to what this light can actually see, so walls cast shadow
    if (shadows && shadows[i]) o.clip(polyPath(shadows[i], u));
    o.fillStyle = g;
    o.beginPath(); o.arc(L.x * u, L.y * u, r, 0, Math.PI * 2); o.fill();
    o.restore();
  });
  // lava lights itself
  o.fillStyle = 'rgba(0,0,0,0.85)';
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++)
    if (map.get(x, y) === T.LAVA) o.fillRect(x * u - u * 0.4, y * u - u * 0.4, u * 1.8, u * 1.8);
  o.globalCompositeOperation = 'source-over';

  if (opts.vignette) {
    const g = o.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    o.fillStyle = g; o.fillRect(0, 0, W, H);
  }
  ctx.drawImage(ov, 0, 0);

  drawSpecular(ctx, map, u, opts, shadows, propMask);

  // warm additive glow
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const warm = hexToRgb('#ffb066');
  ctx.__shadows = shadows;
  for (const p of pools) {
    ctx.save();
    roomPath(ctx, p.room, map, u);
    ctx.clip();
    const r = p.radius * u;
    const g = ctx.createRadialGradient(p.cx * u, p.cy * u, 0, p.cx * u, p.cy * u, r);
    g.addColorStop(0, rgba(warm, 0.17));
    g.addColorStop(0.6, rgba(warm, 0.06));
    g.addColorStop(1, rgba(warm, 0));
    ctx.fillStyle = g;
    ctx.fillRect(p.room.x0 * u, p.room.y0 * u, (p.room.x1 - p.room.x0 + 1) * u, (p.room.y1 - p.room.y0 + 1) * u);
    ctx.restore();
  }
  map.lights.forEach((L, i) => {
    const r = Math.max(u * 0.6, L.range * u);
    const c = hexToRgb(L.color || '#ff9d4c');
    const g = ctx.createRadialGradient(L.x * u, L.y * u, 0, L.x * u, L.y * u, r);
    g.addColorStop(0, rgba(c, 0.32 * (L.intensity ?? 1)));
    g.addColorStop(0.5, rgba(c, 0.12 * (L.intensity ?? 1)));
    g.addColorStop(1, rgba(c, 0));
    ctx.save();
    if (shadows && shadows[i]) ctx.clip(polyPath(shadows[i], u));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(L.x * u, L.y * u, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
  const lavaGlow = hexToRgb('#ff7a2b');
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (map.get(x, y) !== T.LAVA) continue;
    const g = ctx.createRadialGradient((x + 0.5) * u, (y + 0.5) * u, 0, (x + 0.5) * u, (y + 0.5) * u, u * 1.6);
    g.addColorStop(0, rgba(lavaGlow, 0.16));
    g.addColorStop(1, rgba(lavaGlow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x * u - u * 1.6, y * u - u * 1.6, u * 4.2, u * 4.2);
  }
  ctx.restore();
}

/* ---------------- painted style pass ----------------
 * Emulates the look of hand-painted commercial battlemaps: interiors pushed
 * warm and exteriors cool, a canvas grain to bind everything together, and a
 * contrast/saturation grade. These are general painting techniques, not anyone
 * else's artwork — the geometry and props underneath are all ours.
 */

let _grainTile = null;
function grainTile(seed) {
  if (_grainTile && _grainTile.seed === seed) return _grainTile.canvas;
  const N = 128;
  const cv = makeCanvas(N, N);
  const c = cv.getContext('2d');
  const img = c.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0;
    const v = 128 + (hash2(x, y, seed) - 0.5) * 90 + (fbm(x * 0.08, y * 0.08, seed + 3, 3) - 0.5) * 60;
    const k = i * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = clamp(v, 0, 255);
    img.data[k + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  _grainTile = { seed, canvas: cv };
  return cv;
}

/**
 * Cells the outdoors can reach — the complement being everything sealed inside.
 *
 * Rooms are made of floor only, so a pool, a pit or a lava vent punches a hole
 * in the room it sits in. Flooding inwards from the map edge finds those holes,
 * because only a wall stops the flood. Enclosed rooms stop it too: without
 * that, one channel of water running off the map would drag the whole dungeon
 * outdoors with it, since the flood crosses liquid that a room never does.
 */
function enclosedCells(map, rooms) {
  const W = map.w, H = map.h;
  const indoors = new Uint8Array(W * H);
  for (const r of rooms) if (r.enclosed) for (const c of r.cells) indoors[c] = 1;
  const outside = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => {
    if (!map.inBounds(x, y)) return;
    const i = y * W + x;
    if (outside[i] || indoors[i] || isWallTile(map.cells[i])) return;
    outside[i] = 1; stack.push(x, y);
  };
  // step in from off the map, and only where the boundary is open: a map
  // sealed by edge walls has no outdoors at all
  for (let x = 0; x < W; x++) {
    if (map.getH(x, 0) === EDGE.NONE) push(x, 0);
    if (map.getH(x, H) === EDGE.NONE) push(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    if (map.getV(0, y) === EDGE.NONE) push(0, y);
    if (map.getV(W, y) === EDGE.NONE) push(W - 1, y);
  }
  while (stack.length) {
    const cy = stack.pop(), cx = stack.pop();
    if (map.getV(cx + 1, cy) === EDGE.NONE) push(cx + 1, cy);
    if (map.getV(cx, cy) === EDGE.NONE) push(cx - 1, cy);
    if (map.getH(cx, cy + 1) === EDGE.NONE) push(cx, cy + 1);
    if (map.getH(cx, cy) === EDGE.NONE) push(cx, cy - 1);
  }
  return outside;
}

/** Mask of every enclosed interior, used to split warm from cool. */
function interiorMask(map, u, rooms) {
  const cv = makeCanvas(map.w * u, map.h * u);
  const c = cv.getContext('2d');
  if (!rooms) return cv;
  c.fillStyle = '#fff';
  for (const r of rooms) {
    if (!r.enclosed) continue;
    roomPath(c, r, map, u);
    c.fill();
  }
  // the water in an indoor pool is indoors too, and so is anything standing in
  // it: without this the cool wash lands on the pool and blue-tints the props
  const outside = enclosedCells(map, rooms);
  c.beginPath();
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const i = y * map.w + x;
    if (outside[i] || isWallTile(map.cells[i])) continue;
    c.rect(x * u, y * u, u, u);
  }
  c.fill();
  return cv;
}

function applyPaintedStyle(ctx, map, u, opts, rooms) {
  const W = map.w * u, H = map.h * u;
  const seed = hashString(String(map.seed)) & 0xffff;

  // warm indoors, cool outdoors — the complementary split that makes lit
  // interiors read against daylight or snow
  const mask = interiorMask(map, u, rooms);
  const warm = makeCanvas(W, H), wc = warm.getContext('2d');
  wc.fillStyle = '#ffb257'; wc.fillRect(0, 0, W, H);
  wc.globalCompositeOperation = 'destination-in';
  wc.drawImage(mask, 0, 0);
  const cool = makeCanvas(W, H), cc = cool.getContext('2d');
  cc.fillStyle = '#7fa8d8'; cc.fillRect(0, 0, W, H);
  cc.globalCompositeOperation = 'destination-out';
  cc.drawImage(mask, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.55;
  ctx.drawImage(warm, 0, 0);
  ctx.globalAlpha = 0.3;
  ctx.drawImage(cool, 0, 0);
  ctx.restore();

  // canvas grain
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.16;
  const tile = grainTile(seed);
  const pat = ctx.createPattern(tile, 'repeat');
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // contrast and saturation grade — the filter path is an order of magnitude
  // faster than walking the pixels, which matters when water is animating
  if (typeof ctx.filter === 'string') {
    const tmp = makeCanvas(W, H);
    tmp.getContext('2d').drawImage(ctx.canvas, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.filter = 'contrast(1.13) saturate(1.16) brightness(1.02)';
    ctx.drawImage(tmp, 0, 0);
    ctx.filter = 'none';
    ctx.restore();
    return;
  }
  try {
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const C = 1.14, SAT = 1.16;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = lum + (r - lum) * SAT; g = lum + (g - lum) * SAT; b = lum + (b - lum) * SAT;
      d[i] = clamp((r - 128) * C + 130, 0, 255);
      d[i + 1] = clamp((g - 128) * C + 130, 0, 255);
      d[i + 2] = clamp((b - 128) * C + 130, 0, 255);
    }
    ctx.putImageData(img, 0, 0);
  } catch (e) { /* tainted canvas from an imported image — skip the grade */ }
}

/* ---------------- specular sheen ----------------
 * Ice and water are glossy: a light near them should throw a bright highlight
 * back, tinted by that light, and it should fall off far faster than the
 * light's own diffuse pool. Matte surfaces get nothing.
 */

const GLOSS = {};
GLOSS[T.ICE] = 1.0;
GLOSS[T.WATER] = 0.45;
GLOSS[T.DEEP] = 0.3;
GLOSS[T.SNOW] = 0.1;    // snow twinkles, it does not sheet like a mirror

function drawSpecular(ctx, map, u, opts, shadows, propMask) {
  if (!map.lights.length) return;
  const cells = [];
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const g = GLOSS[map.get(x, y)];
    if (g) cells.push([x, y, g]);
  }
  if (!cells.length) return;

  const seed = hashString(String(map.seed)) & 0xffff;
  const W = map.w * u, H = map.h * u;
  const layer = makeCanvas(W, H);
  const lc = layer.getContext('2d');

  // glossy surfaces only, so the highlight can never spill onto stone
  // one mask per gloss level, so ice takes far more sheen than snow
  const byGloss = {};
  for (const [x, y, g] of cells) (byGloss[g] = byGloss[g] || []).push([x, y]);
  lc.globalCompositeOperation = 'lighter';

  for (const gloss in byGloss) {
  const mask = new Path2D();
  for (const [x, y] of byGloss[gloss]) mask.rect(x * u, y * u, u, u);
  lc.save();
  lc.clip(mask);
  lc.globalAlpha = +gloss;
  map.lights.forEach((L, li) => {
    const range = Math.max(0.6, L.range || 4);
    const c = hexToRgb(L.color || '#ff9d4c');
    // pull the highlight toward white: a specular reflection is closer to the
    // light's own colour than the diffuse bounce is
    const hot = mixRGB(c, [255, 255, 255], 0.3);
    // half the light's reach: a highlight, not a second pool of light
    const r = range * u * 0.42;
    const g = lc.createRadialGradient(L.x * u, L.y * u, 0, L.x * u, L.y * u, r);
    // kept below saturation on purpose: blown-out white would throw away the
    // light's colour, which is the whole point of tinting the sheen
    const a = 0.26 * clamp(L.intensity === undefined ? 1 : L.intensity, 0, 1);
    g.addColorStop(0, rgba(hot, a));
    g.addColorStop(0.4, rgba(hot, a * 0.4));
    g.addColorStop(1, rgba(hot, 0));
    lc.save();
    if (shadows && shadows[li]) lc.clip(polyPath(shadows[li], u));
    lc.fillStyle = g;
    lc.beginPath(); lc.arc(L.x * u, L.y * u, r, 0, Math.PI * 2); lc.fill();
    lc.restore();
  });
  lc.restore();
  }
  lc.save();
  lc.globalCompositeOperation = 'lighter';

  // glints: tiny bright points that only appear where a light reaches
  for (const [x, y, gloss] of cells) {
    if (gloss < 0.5) continue;
    let best = 0, bestCol = null;
    for (const L of map.lights) {
      const d = Math.hypot(L.x - (x + 0.5), L.y - (y + 0.5));
      const range = Math.max(0.6, L.range || 4);
      const f = clamp(1 - d / range, 0, 1);
      if (f > best) { best = f; bestCol = L.color; }
    }
    if (best < 0.15) continue;
    const n = 2;
    for (let i = 0; i < n; i++) {
      const rx = hash2(x * 31 + i, y * 17, seed), ry = hash2(x * 13, y * 29 + i, seed + 5);
      if (hash2(x + i, y, seed + 11) > 0.45) continue;
      const px = (x + rx) * u, py = (y + ry) * u;
      const rad = u * (0.03 + hash2(x, y + i, seed + 3) * 0.05);
      const col = mixRGB(hexToRgb(bestCol || '#ffffff'), [255, 255, 255], 0.45);
      const gg = lc.createRadialGradient(px, py, 0, px, py, rad * 3);
      gg.addColorStop(0, rgba(col, 0.85 * best * gloss));
      gg.addColorStop(1, rgba(col, 0));
      lc.fillStyle = gg;
      lc.beginPath(); lc.arc(px, py, rad * 3, 0, Math.PI * 2); lc.fill();
    }
  }
  lc.restore();

  // a sheen is a property of the water surface, so anything sitting on top of
  // it must not be washed over
  if (propMask) {
    lc.globalCompositeOperation = 'destination-out';
    lc.drawImage(propMask, 0, 0);
    lc.globalCompositeOperation = 'source-over';
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

/* ---------------- grid ----------------

   A battlemap is nearly always 5 ft squares, but not always: hex is the older
   convention for wilderness and a few systems never left it, and an isometric
   diamond suits a map drawn in three-quarter view. All three are drawn the same
   way — one path, stroked once — and all three key off the same grid unit, so a
   hex is one square across the flats and an iso diamond is one square tall.

   The lattice is a drawing convention, not a change to the map model: cells,
   walls and every VTT export stay square underneath. What the hex option gives
   you is a printed sheet, or an image for a VTT that does its own hex overlay. */

const GRID_TYPES = {
  square: 'Square',
  hexV: 'Hex — pointy top',
  hexH: 'Hex — flat top',
  iso: 'Isometric diamond'
};

/** The grid as a Path2D in pixels. Kept separate from the stroking so the
    shadow pass can re-use the same geometry rather than rebuild it. */
function gridPath(map, u, opts) {
  const W = map.w * u, H = map.h * u;
  const p = new Path2D();
  const ox = (opts.gridOffX || 0) * u, oy = (opts.gridOffY || 0) * u;
  const type = opts.gridType || 'square';

  if (type === 'square') {
    for (let x = 0; x <= map.w; x++) { const px = Math.round(x * u + ox) + 0.5; p.moveTo(px, 0); p.lineTo(px, H); }
    for (let y = 0; y <= map.h; y++) { const py = Math.round(y * u + oy) + 0.5; p.moveTo(0, py); p.lineTo(W, py); }
    return p;
  }

  if (type === 'iso') {
    // Two families of lines at slope ±1/2. Stepping the intercept by one grid
    // square makes each diamond two squares wide and one tall, which is the
    // ratio every isometric tileset is drawn to.
    const lo = -W / 2 - u, hi = H + W / 2 + u;
    for (let c = lo; c <= hi; c += u) {
      p.moveTo(0, c + oy - ox / 2); p.lineTo(W, c + oy + (W - ox) / 2);
      p.moveTo(0, c + oy + ox / 2); p.lineTo(W, c + oy - (W - ox) / 2);
    }
    return p;
  }

  // Hexes. One hex measures a grid square across its flats, so a token still
  // covers about the same ground as it did on the square grid.
  const pointy = type === 'hexV';
  const R = u / Math.sqrt(3);                 // circumradius
  const stepA = u;                            // along the row of flats
  const stepB = R * 1.5;                      // between rows
  const cols = Math.ceil(W / stepA) + 2, rows = Math.ceil(H / stepB) + 2;
  const corner = (cx, cy, i) => {
    const a = (Math.PI / 3) * i + (pointy ? -Math.PI / 2 : 0);
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  };
  for (let b = -1; b < rows; b++) {
    for (let a = -1; a < cols; a++) {
      const shift = (b & 1) ? stepA / 2 : 0;
      const cx = pointy ? a * stepA + shift + ox : b * stepB + ox;
      const cy = pointy ? b * stepB + oy : a * stepA + shift + oy;
      const [sx, sy] = corner(cx, cy, 0);
      p.moveTo(sx, sy);
      for (let i = 1; i < 6; i++) { const [px, py] = corner(cx, cy, i); p.lineTo(px, py); }
      p.closePath();
    }
  }
  return p;
}

function drawGrid(ctx, map, u, opts) {
  const W = map.w * u, H = map.h * u;
  const path = gridPath(map, u, opts);
  const lw = Math.max(0.5, (opts.gridWeight || 1) * u / 70);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();                       // hexes and iso lines overshoot the map
  ctx.lineJoin = 'round';
  // A grid drawn in one colour disappears wherever the art happens to match it.
  // The relief line sits a hair below and in the opposite tone, so a black grid
  // stays readable over black rock and a white one over snow.
  if (opts.gridRelief) {
    const dark = hexToRgb(opts.gridColor).reduce((a, b) => a + b, 0) < 384;
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
    ctx.globalAlpha = opts.gridAlpha * 0.7;
    ctx.lineWidth = lw;
    ctx.save();
    ctx.translate(lw, lw);
    ctx.stroke(path);
    ctx.restore();
  }
  ctx.strokeStyle = opts.gridColor;
  ctx.globalAlpha = opts.gridAlpha;
  ctx.lineWidth = lw;
  ctx.stroke(path);
  ctx.restore();
}
/* ---------------- the layer stack ----------------
   The order things are drawn in is data now, not a script: renderMap and the
   editor's compose() both walk map.layers from the bottom up and ask each layer
   to contribute. See js/layers.js for what the two kinds of layer are and why
   they take different controls. */

/* An additive layer paints onto its own sheet, which is then composited — the
   only way opacity and a blend mode can mean anything. A layer that is fully
   opaque and blending normally draws straight through instead, because that is
   the overwhelmingly common case and a scratch canvas per layer per frame is
   not free. */
function compositeLayer(ctx, map, u, L, draw) {
  const plain = L.opacity >= 0.999 && (!L.blend || L.blend === 'normal');
  if (plain) { draw(ctx); return null; }
  const cv = makeCanvas(map.w * u, map.h * u);
  draw(cv.getContext('2d'));
  ctx.save();
  ctx.globalAlpha = clamp(L.opacity, 0, 1);
  if (L.blend && L.blend !== 'normal') ctx.globalCompositeOperation = L.blend;
  ctx.drawImage(cv, 0, 0);
  ctx.restore();
  return cv;
}

/* A filter layer has no pixels of its own; it reads what is beneath and changes
   it. Opacity is therefore a cross-fade back to the image as it was, which is
   what makes half the weather look like half the weather rather than a faint
   copy of the whole of it laid on top. */
function filterLayer(ctx, map, u, L, apply) {
  const a = clamp(L.opacity, 0, 1);
  if (a <= 0.001) return;
  if (a >= 0.999) { apply(ctx); return; }
  const before = makeCanvas(map.w * u, map.h * u);
  before.getContext('2d').drawImage(ctx.canvas, 0, 0);
  apply(ctx);
  ctx.save();
  ctx.globalAlpha = 1 - a;
  ctx.drawImage(before, 0, 0);
  ctx.restore();
}

/* The ground and everything built into it. Sunk props are drawn here, between
   the floor and the water over it, because that sandwich is what makes them
   read as under the surface — but only the ones whose own layer is showing, so
   hiding a layer still takes its props with it. */
function drawTerrainLayer(ctx, map, u, opts, seed, env) {
  if (env.terrain) {
    ctx.drawImage(env.terrain, 0, 0);
  } else if (env.bgImage) {
    // traced art is placed by its own grid size and offset, which only the
    // editor knows; a caller without that hook gets the plain stretch
    if (env.drawBg) env.drawBg(ctx, map, u);
    else {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(env.bgImage, 0, 0, map.w * u, map.h * u);
    }
  } else {
    drawBase(ctx, map, u, opts, seed);
    drawTileDetail(ctx, map, u, seed, roomIndexMap(map, env.rooms), opts.water && opts.water.flow);
    drawWalls(ctx, map, u, opts, seed);
  }
  drawSunkProps(ctx, map, u, opts, visibleProps(map));
  if (!env.bgImage) {
    drawWaterFlow(ctx, map, u, env.liquidOpts || opts, env.waterPath);
    drawLavaFlow(ctx, map, u, env.liquidOpts || opts, env.lavaPath);
  }
  if (env.bgImage) { if (env.traceOverlay) env.traceOverlay(ctx, map, u); }
  else drawEdgeWalls(ctx, map, u, opts, seed);
  // doors are architecture and belong with the walls they hang in; they also go
  // into the mask, so the water sheen does not wash across a door leaf
  if (opts.doors !== false) {
    drawDoors(ctx, map, u);
    drawDoors(env.propMask.getContext('2d'), map, u);
  }
}

/* Props first, then the labels of the same layer over them. The props also go
   into the running mask of things standing on the floor, which is what stops
   the light pooling and the water sheen washing over them; labels do not,
   because a label is writing on the map, not an object casting anything. */
function drawObjectLayer(ctx, map, u, opts, L, env) {
  const props = map.props.filter(p => p.lay === L.id && !propIsSunk(map, p));
  const labels = (map.labels || []).filter(l => l.lay === L.id);
  if (props.length) {
    const sheet = compositeLayer(ctx, map, u, L, (c) => drawPropList(c, map, u, opts, props));
    const mc = env.propMask.getContext('2d');
    if (sheet) {
      mc.save(); mc.globalAlpha = clamp(L.opacity, 0, 1); mc.drawImage(sheet, 0, 0); mc.restore();
    } else {
      drawPropList(mc, map, u, opts, props);
    }
  }
  if (labels.length) compositeLayer(ctx, map, u, L, (c) => { for (const l of labels) drawLabel(c, l, u); });
}

/** Walk the stack. `env` carries what the editor already has cached — a
    pre-rendered terrain canvas, the liquid paths, the shadow polygons — so the
    same walk serves the editor's incremental compose and a cold export. */
function drawLayerStack(ctx, map, u, opts, seed, envIn) {
  ensureLayers(map);
  const env = Object.assign({ rooms: null, shadows: null }, envIn || {});
  if (!env.rooms) env.rooms = findRooms(map);
  env.propMask = makeCanvas(map.w * u, map.h * u);

  for (const L of map.layers) {
    if (!L.visible) continue;
    switch (L.kind) {
      case 'terrain':
        drawTerrainLayer(ctx, map, u, opts, seed, env);
        break;
      case 'objects':
        drawObjectLayer(ctx, map, u, opts, L, env);
        break;
      case 'lighting': {
        if (opts.lighting === false) break;
        const sh = env.shadows || computeLightShadows(map).polys;
        filterLayer(ctx, map, u, L, (c) => drawLighting(c, map, u, opts, env.rooms, sh, env.propMask));
        break;
      }
      case 'finish':
        if (opts.style !== 'painted' || env.bgImage) break;
        filterLayer(ctx, map, u, L, (c) => applyPaintedStyle(c, map, u, opts, env.rooms));
        break;
      case 'atmos':
        filterLayer(ctx, map, u, L, (c) => drawAtmosphere(c, map, u, opts, seed));
        break;
      case 'grid':
        if (opts.grid === false) break;
        compositeLayer(ctx, map, u, L, (c) => drawGrid(c, map, u, opts));
        break;
    }
  }
  return ctx.canvas;
}

/* ---------------- top level ---------------- */

function renderMap(map, optsIn) {
  const opts = Object.assign(defaultRenderOpts(), optsIn || {});
  const u = opts.ppg || map.ppg;
  const cv = makeCanvas(map.w * u, map.h * u);
  const ctx = cv.getContext('2d');
  const seed = hashString(String(map.seed)) & 0xffff;
  drawLayerStack(ctx, map, u, opts, seed, { rooms: findRooms(map), bgImage: opts.bgImage || null });
  return cv;
}
