/* Battlemap Forge — atmosphere: weather, time of day and colour grading.
 *
 * The renderer already lights a map. What it could not do was give the whole
 * scene a *mood*: the same dungeon at noon and at midnight, the same forest
 * clear and in driving rain. Inkarnate solves this with stacked filter layers,
 * and the idea is worth stealing wholesale — a single pass over the finished
 * image is far cheaper than teaching every terrain and prop about weather, and
 * it composes with everything, including a traced background image.
 *
 * Two halves:
 *
 *   grading   saturation, contrast, brightness, a colour cast and a fade,
 *             applied with ctx.filter and a couple of blended fills so it costs
 *             one composite rather than a pass over every pixel in JavaScript
 *   effects   fog banks, rain, snow, sunbeams, drifting motes, embers and a
 *             vignette, all drawn from the map's own seed
 *
 * Everything is sized in grid units and counted per grid square, so a 35 px
 * preview and a 140 px export show the same weather, not the same number of
 * raindrops at different sizes. And everything is seeded from the map, so an
 * export is reproducible: the storm falls in the same place every time.
 */
'use strict';

/* ---------------- the configuration ---------------- */

function defaultAtmos() {
  return {
    preset: 'none',
    amount: 1,      // scales the whole preset, 0..1.5
    sat: 1,         // manual grade, multiplied onto the preset's own
    contrast: 1,
    warm: 0,        // -1 cold .. +1 warm
    fade: 0         // lifts the blacks, like haze or old paper
  };
}

/* grade fields, all optional:
     sat/contrast/bright  multipliers, 1 = untouched
     tint    [r,g,b,a]    multiplied in — darkens and casts colour
     glow    [r,g,b,a]    screened on — lifts and casts colour
     fade    0..1         washes toward paper white
   fx is a list of effects, drawn in the order given. */
const ATMOS = {};
const ATMOS_ORDER = [];

function defAtmos(key, label, grade, fx, hint) {
  ATMOS[key] = { key, label, grade: grade || {}, fx: fx || [], hint: hint || '' };
  ATMOS_ORDER.push(key);
}

defAtmos('none', 'Clear', {}, [], 'No weather. The map as lit.');

defAtmos('dusk', 'Golden hour',
  { sat: 1.12, bright: 1.02, glow: [255, 176, 92, 0.16] },
  [{ kind: 'rays', strength: 0.5, spread: 1 }, { kind: 'motes', n: 0.12, color: [255, 226, 178], rise: -0.15 }],
  'Low warm sun, long beams, dust in the air.');

defAtmos('night', 'Night',
  { sat: 0.5, bright: 0.76, contrast: 1.06, tint: [58, 76, 140, 0.42] },
  [{ kind: 'vignette', strength: 0.4 }],
  'Cold and dark. Your light sources do the rest.');

defAtmos('moonlit', 'Moonlit',
  { sat: 0.6, bright: 0.86, tint: [64, 88, 156, 0.3], glow: [150, 178, 235, 0.1] },
  [{ kind: 'fog', density: 0.22, color: [150, 172, 215], scale: 3.4 },
   { kind: 'vignette', strength: 0.3 }],
  'Night with a moon up — enough light to read the ground by.');

defAtmos('overcast', 'Overcast',
  { sat: 0.76, contrast: 0.93, bright: 0.96, tint: [148, 156, 168, 0.2], fade: 0.1 },
  [], 'Flat grey daylight, no shadows to speak of.');

defAtmos('fog', 'Fog',
  { sat: 0.72, contrast: 0.88, fade: 0.14 },
  [{ kind: 'fog', density: 0.34, color: [206, 212, 220], scale: 2.6 },
   { kind: 'fog', density: 0.15, color: [226, 230, 236], scale: 5.5 }],
  'Banks of it, thicker in some places than others.');

defAtmos('rain', 'Rain',
  { sat: 0.78, contrast: 0.96, bright: 0.9, tint: [110, 128, 150, 0.2] },
  [{ kind: 'fog', density: 0.18, color: [180, 192, 208], scale: 3 },
   { kind: 'rain', n: 2.6, len: 0.55, tilt: 0.22 }],
  'Steady rain, falling with a little tilt.');

defAtmos('storm', 'Storm',
  { sat: 0.66, contrast: 1.08, bright: 0.76, tint: [70, 84, 112, 0.34] },
  [{ kind: 'fog', density: 0.26, color: [150, 164, 186], scale: 2.4 },
   { kind: 'rain', n: 5.5, len: 0.85, tilt: 0.42 },
   { kind: 'vignette', strength: 0.35 }],
  'Driving rain and a dark sky.');

defAtmos('snow', 'Snowfall',
  { sat: 0.86, bright: 1.04, tint: [176, 194, 216, 0.16] },
  [{ kind: 'snow', n: 0.7 }],
  'Big soft flakes coming down.');

defAtmos('blizzard', 'Blizzard',
  { sat: 0.6, contrast: 0.84, bright: 1.06, fade: 0.2 },
  [{ kind: 'fog', density: 0.44, color: [232, 238, 246], scale: 2.2 },
   { kind: 'snow', n: 2.4, tilt: 0.5 },
   { kind: 'vignette', strength: 0.22, color: [235, 242, 250] }],
  'Whiteout. You cannot see the far wall.');

defAtmos('rays', 'Sunbeams',
  { bright: 1.03, glow: [255, 236, 190, 0.1] },
  [{ kind: 'rays', strength: 1, spread: 0.8 },
   { kind: 'motes', n: 0.18, color: [255, 240, 210], rise: -0.1 }],
  'Shafts through a hole in the roof or the canopy.');

defAtmos('dust', 'Dusty air',
  { sat: 0.94, fade: 0.09, glow: [214, 190, 150, 0.08] },
  [{ kind: 'motes', n: 0.34, color: [226, 208, 172], rise: -0.05 }],
  'A shut-up room where nobody has walked for years.');

defAtmos('ash', 'Ashfall',
  { sat: 0.62, bright: 0.86, tint: [96, 88, 82, 0.28] },
  [{ kind: 'fog', density: 0.24, color: [136, 128, 122], scale: 3 },
   { kind: 'snow', n: 1.1, color: [178, 172, 166], tilt: 0.18 },
   { kind: 'motes', n: 0.16, color: [255, 148, 70], rise: 0.4 }],
  'Grey flakes falling, sparks going the other way.');

defAtmos('ember', 'Emberlight',
  { sat: 1.14, contrast: 1.06, glow: [255, 110, 40, 0.16] },
  [{ kind: 'motes', n: 0.5, color: [255, 156, 60], rise: 0.5 },
   { kind: 'vignette', strength: 0.34, color: [40, 10, 4] }],
  'Something enormous is burning just off the map.');

defAtmos('gloom', 'Gloom and doom',
  { sat: 0.42, contrast: 1.12, bright: 0.8, tint: [50, 56, 64, 0.34] },
  [{ kind: 'vignette', strength: 0.48 }],
  'Colour drained out of the world.');

defAtmos('underdark', 'Underdark',
  { sat: 0.38, contrast: 1.1, bright: 0.66, tint: [34, 48, 74, 0.44] },
  [{ kind: 'vignette', strength: 0.55 },
   { kind: 'motes', n: 0.09, color: [130, 200, 220], rise: -0.2 }],
  'Deep places. Nothing is lit that you did not light.');

defAtmos('fey', 'Feywild',
  { sat: 1.3, bright: 1.05, glow: [190, 120, 235, 0.14] },
  [{ kind: 'fog', density: 0.2, color: [212, 168, 240], scale: 3.6 },
   { kind: 'motes', n: 0.5, color: [190, 255, 226], rise: -0.3 },
   { kind: 'motes', n: 0.24, color: [255, 190, 240], rise: -0.5 }],
  'Too saturated, too many lights, nothing quite still.');

defAtmos('corrupt', 'Corruption',
  { sat: 0.8, contrast: 1.18, bright: 0.86, tint: [92, 120, 60, 0.3] },
  [{ kind: 'fog', density: 0.24, color: [136, 168, 92], scale: 2.8 },
   { kind: 'motes', n: 0.2, color: [176, 220, 110], rise: 0.2 },
   { kind: 'vignette', strength: 0.4, color: [16, 26, 10] }],
  'Something sick has been growing here.');

defAtmos('sunset', 'Red sky',
  { sat: 1.16, contrast: 1.04, tint: [214, 108, 66, 0.24], glow: [255, 132, 62, 0.14] },
  [{ kind: 'rays', strength: 0.7, spread: 1.3 },
   { kind: 'vignette', strength: 0.28, color: [58, 16, 8] }],
  'Last light, or the sky is on fire. Your call.');

defAtmos('winter', 'Winter',
  { sat: 0.7, bright: 1.08, contrast: 0.95, tint: [168, 196, 224, 0.2], fade: 0.1 },
  [{ kind: 'vignette', strength: 0.2, color: [180, 200, 224] }],
  'Cold flat light off snow. No weather falling.');

/* ---------------- support ---------------- */

/** ctx.filter is how the grade avoids a pass over every pixel in JS. Safari
    only grew it in 16.4, so the grade degrades to the tint fills without it. */
let _hasFilter = null;
function canvasFilterSupported() {
  if (_hasFilter === null) {
    try {
      const c = makeCanvas(1, 1).getContext('2d');
      c.filter = 'saturate(0.5)';
      _hasFilter = c.filter !== 'none' && c.filter !== '';
    } catch (e) { _hasFilter = false; }
  }
  return _hasFilter;
}

/** A soft fbm cloud, built small and blown up. Bilinear upscaling is exactly
    the smoothing fog wants, so 96 px of noise covers an 8000 px map. */
const _fogCache = {};
function fogTile(seed, scale, color) {
  const key = seed + '|' + scale + '|' + color.join(',');
  if (_fogCache[key]) return _fogCache[key];
  const n = 96;
  const cv = makeCanvas(n, n);
  const c = cv.getContext('2d');
  const img = c.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = fbm(x / n * scale, y / n * scale, seed, 4, 2.1, 0.55);
      const i = (y * n + x) * 4;
      img.data[i] = color[0]; img.data[i + 1] = color[1]; img.data[i + 2] = color[2];
      // the threshold is what turns an even haze into banks with gaps
      img.data[i + 3] = clamp((v - 0.44) * 3.6, 0, 1) * 255;
    }
  }
  c.putImageData(img, 0, 0);
  // a new seed on every forge would otherwise grow this without limit
  const keys = Object.keys(_fogCache);
  if (keys.length > 16) delete _fogCache[keys[0]];
  _fogCache[key] = cv;
  return cv;
}

/* ---------------- effects ---------------- */

function fxFog(ctx, W, H, u, rnd, seed, e, k) {
  const tile = fogTile((seed + Math.round(e.scale * 100)) & 0xffff, e.scale || 3, e.color || [210, 216, 224]);
  ctx.save();
  ctx.globalAlpha = clamp(e.density * k, 0, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // The tile is 96 texels across whatever the map is wide, so bilinear leaves a
  // faint diamond lattice at export resolution. A blur of about one texel is
  // what turns that back into cloud.
  if (canvasFilterSupported()) ctx.filter = 'blur(' + Math.min(48, Math.max(2, W / 150)).toFixed(1) + 'px)';
  // two passes at different scales and offsets, so no single octave reads
  ctx.drawImage(tile, -W * 0.04, -H * 0.04, W * 1.08, H * 1.08);
  ctx.globalAlpha *= 0.55;
  ctx.drawImage(tile, -W * 0.21, -H * 0.13, W * 1.42, H * 1.28);
  ctx.restore();
}

function fxRain(ctx, W, H, u, rnd, seed, e, k) {
  const count = Math.round((W / u) * (H / u) * (e.n || 2) * k);
  const len = (e.len || 0.6) * u, tilt = e.tilt || 0.25;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rnd.range(-len, W), y = rnd.range(-len, H);
    const l = len * rnd.range(0.6, 1.35);
    const near = rnd.next();                 // depth: near drops are longer and brighter
    ctx.globalAlpha = 0.14 + near * 0.3;
    ctx.lineWidth = Math.max(0.6, u * (0.008 + near * 0.014));
    ctx.strokeStyle = near > 0.85 ? 'rgba(232,240,252,1)' : 'rgba(186,204,228,1)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + l * tilt, y + l);
    ctx.stroke();
  }
  ctx.restore();
}

function fxSnow(ctx, W, H, u, rnd, seed, e, k) {
  const count = Math.round((W / u) * (H / u) * (e.n || 1.5) * k);
  const col = e.color || [255, 255, 255];
  const tilt = e.tilt || 0;
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = rnd.range(0, W), y = rnd.range(0, H);
    const near = rnd.next();
    const r = u * (0.014 + near * near * 0.075);
    ctx.globalAlpha = 0.2 + near * 0.6;
    ctx.fillStyle = rgb(col);
    ctx.beginPath();
    // far flakes are dots; near ones smear a little along the fall
    if (tilt && near > 0.7) {
      ctx.ellipse(x, y, r, r * (1 + tilt * 1.6), Math.atan2(1, tilt) - Math.PI / 2, 0, Math.PI * 2);
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
}

/** Shafts of light thrown from the same corner the prop shading lights from,
    so the beams and every shadow on the map agree about where the sun is. */
function fxRays(ctx, W, H, u, rnd, seed, e, k) {
  const strength = (e.strength || 1) * k;
  const spread = e.spread || 1;
  const D = Math.hypot(W, H) * 1.6;
  // SUN points the way shadows fall, so the sun itself is back along it
  const ang = Math.atan2(-SUN.y, -SUN.x);
  const ox = W * 0.5 - Math.cos(ang) * D * 0.55;
  const oy = H * 0.5 - Math.sin(ang) * D * 0.55;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.translate(ox, oy);
  ctx.rotate(ang);
  const beams = 7;
  for (let i = 0; i < beams; i++) {
    const off = (rnd.next() - 0.5) * D * 0.55 * spread;
    const wid = D * rnd.range(0.02, 0.075) * spread;
    const a = strength * rnd.range(0.08, 0.19);
    const g = ctx.createLinearGradient(0, 0, D, 0);
    g.addColorStop(0, `rgba(255,244,214,${a})`);
    g.addColorStop(0.45, `rgba(255,238,200,${a * 0.55})`);
    g.addColorStop(1, 'rgba(255,236,196,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, off);
    ctx.lineTo(D, off - wid * 2.4);
    ctx.lineTo(D, off + wid * 2.4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Specks caught in the light. `rise` tilts them: negative drifts them up the
    map, positive sends them down, which is the difference between dust in a
    sunbeam and sparks off a fire. */
function fxMotes(ctx, W, H, u, rnd, seed, e, k) {
  const count = Math.round((W / u) * (H / u) * (e.n || 0.5) * k);
  const col = e.color || [255, 240, 210];
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < count; i++) {
    const x = rnd.range(0, W), y = rnd.range(0, H);
    const near = rnd.next();
    const r = u * (0.014 + near * near * 0.055);
    const a = 0.12 + near * 0.34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
    g.addColorStop(0, rgba(col, a));
    g.addColorStop(0.4, rgba(col, a * 0.32));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
    ctx.fill();
    // a short trail, so a spark reads as moving
    if (e.rise && near > 0.55) {
      ctx.globalAlpha = a * 0.35;
      ctx.strokeStyle = rgb(col);
      ctx.lineWidth = Math.max(0.5, r * 0.7);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + r * rnd.range(-1, 1), y + e.rise * u * 0.5 * rnd.range(0.6, 1.4));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

function fxVignette(ctx, W, H, u, rnd, seed, e, k) {
  const s = clamp((e.strength || 0.4) * k, 0, 1);
  const col = e.color || [0, 0, 0];
  const light = col[0] + col[1] + col[2] > 400;
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28,
                                     W / 2, H / 2, Math.hypot(W, H) * 0.62);
  g.addColorStop(0, rgba(col, 0));
  g.addColorStop(0.6, rgba(col, s * 0.3));
  g.addColorStop(1, rgba(col, s));
  ctx.save();
  // a pale vignette is fog crowding in, so it goes over; a dark one is falloff
  ctx.globalCompositeOperation = light ? 'source-over' : 'multiply';
  if (light) ctx.globalAlpha = 0.9;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* Effects split by how they composite, because that is what decides whether
   they can be cached. Everything in one group flattens into a single overlay
   that is blitted with that group's operator. */
const ATMOS_FX_OVER = { fog: fxFog, rain: fxRain, snow: fxSnow };
const ATMOS_FX_SCREEN = { rays: fxRays, motes: fxMotes };

/* ---------------- the pass ---------------- */

/** True when the settings would visibly change anything, so the common case —
    no weather, no grade — costs one object lookup and no canvas work. */
function atmosActive(a) {
  if (!a) return false;
  const preset = ATMOS[a.preset];
  const hasPreset = preset && a.preset !== 'none' && (a.amount || 0) > 0.001;
  const hasManual = Math.abs((a.sat === undefined ? 1 : a.sat) - 1) > 0.005 ||
                    Math.abs((a.contrast === undefined ? 1 : a.contrast) - 1) > 0.005 ||
                    Math.abs(a.warm || 0) > 0.005 || (a.fade || 0) > 0.005;
  return !!(hasPreset || hasManual);
}

/* The weather that falls out of the sky does not depend on what is underneath
   it, so for a given preset, seed and size it is the same picture every frame.
   The editor re-composites at 12 fps while water is animating, and drawing
   three thousand raindrops that often is the difference between smooth and not,
   so the two cacheable groups are flattened once and blitted after that.

   One entry, and only below a size where holding two full-frame canvases is
   cheaper than redrawing them: an 8000 px export wants the memory more than it
   wants the second frame it is never going to draw. */
const ATMOS_CACHE_MAX_PX = 6e6;
let _fxCache = null;

function atmosOverlays(map, u, preset, k, seed) {
  const W = map.w * u, H = map.h * u;
  const key = [preset.key, k.toFixed(3), W, H, seed].join('|');
  if (_fxCache && _fxCache.key === key) return _fxCache;

  const groups = [
    { op: 'source-over', table: ATMOS_FX_OVER, cv: null },
    { op: 'screen', table: ATMOS_FX_SCREEN, cv: null }
  ];
  // One RNG for the lot, in preset order, so adding an effect to a preset does
  // not reshuffle the ones declared before it.
  const rnd = new RNG((seed ^ 0x5eed17) >>> 0);
  for (const e of preset.fx) {
    const g = groups.find(g => g.table[e.kind]);
    if (!g) continue;
    if (!g.cv) g.cv = makeCanvas(W, H);
    g.table[e.kind](g.cv.getContext('2d'), W, H, u, rnd, seed, e, k);
  }
  const out = { key, groups };
  if (W * H <= ATMOS_CACHE_MAX_PX) _fxCache = out;
  return out;
}

function drawAtmosphere(ctx, map, u, opts, seed) {
  const a = Object.assign(defaultAtmos(), opts && opts.atmos);
  if (!atmosActive(a)) return;
  const preset = ATMOS[a.preset] || ATMOS.none;
  const k = clamp(a.amount === undefined ? 1 : a.amount, 0, 1.5);
  const W = map.w * u, H = map.h * u;
  const g = preset.grade;

  /* --- grade. One filtered redraw of the whole image. --- */
  const sat = lerp(1, g.sat === undefined ? 1 : g.sat, k) * (a.sat === undefined ? 1 : a.sat);
  const con = lerp(1, g.contrast === undefined ? 1 : g.contrast, k) * (a.contrast === undefined ? 1 : a.contrast);
  const bri = lerp(1, g.bright === undefined ? 1 : g.bright, k);
  if (canvasFilterSupported() &&
      (Math.abs(sat - 1) > 0.005 || Math.abs(con - 1) > 0.005 || Math.abs(bri - 1) > 0.005)) {
    const tmp = makeCanvas(W, H);
    tmp.getContext('2d').drawImage(ctx.canvas, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    ctx.filter = 'saturate(' + sat.toFixed(3) + ') contrast(' + con.toFixed(3) + ') brightness(' + bri.toFixed(3) + ')';
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }

  /* --- colour cast --- */
  if (g.tint) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = clamp(g.tint[3] * k, 0, 1);
    // multiply toward the tint rather than to it: at full alpha a saturated
    // tint would black out every channel it is short of
    ctx.fillStyle = rgb([lerp(255, g.tint[0], 0.75), lerp(255, g.tint[1], 0.75), lerp(255, g.tint[2], 0.75)]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (g.glow) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = clamp(g.glow[3] * k, 0, 1);
    ctx.fillStyle = rgb(g.glow);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /* --- manual warmth, on top of whatever the preset decided --- */
  const warm = a.warm || 0;
  if (Math.abs(warm) > 0.005) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = clamp(Math.abs(warm) * 0.8, 0, 1);
    ctx.fillStyle = warm > 0 ? '#ff9a3c' : '#4fa6ff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /* --- haze: lift the blacks toward paper, which is what distance does --- */
  const fade = clamp((g.fade || 0) * k + (a.fade || 0), 0, 0.8);
  if (fade > 0.005) {
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /* --- weather --- */
  if (preset.fx.length) {
    for (const grp of atmosOverlays(map, u, preset, k, seed).groups) {
      if (!grp.cv) continue;
      ctx.save();
      ctx.globalCompositeOperation = grp.op;
      ctx.drawImage(grp.cv, 0, 0);
      ctx.restore();
    }
    // the vignette closes over everything else, and is one gradient fill, so it
    // is drawn live rather than baked into an overlay it could not composite in
    const rnd = new RNG((seed ^ 0x1a5e11) >>> 0);
    for (const e of preset.fx) if (e.kind === 'vignette') fxVignette(ctx, W, H, u, rnd, seed, e, k);
  }
}
