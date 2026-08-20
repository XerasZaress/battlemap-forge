/* Battlemap Forge — prop library.
   Every prop draws into a context already translated to its centre and rotated,
   with `u` = pixels per grid square. Footprint is roughly `size` grid squares.

   Props also declare `h`: how tall they stand, in grid units, where one unit is
   one 5 ft square. A dining table is about 0.5, a bookshelf 1.2, a stone pillar
   2.4. Nothing in the draw function uses it — it is read by js/shading.js, which
   turns it into the cast shadow, the side face and the contact shading that make
   the prop sit on the floor. Leave it out and the prop takes its category's
   default; set `under: true` and it lies flat and gets none of them. */
'use strict';

const PROPS = {};
const PROP_LIST = [];

function defProp(key, label, cat, opts, draw) {
  const p = Object.assign({ key, label, cat, size: 1, draw, rand: true }, opts || {});
  // Built things line up with the architecture; natural things sit at any angle.
  if (p.snap === undefined) p.snap = cat === 'furniture' || cat === 'structure';
  PROPS[key] = p; PROP_LIST.push(p);
  return p;
}

/**
 * A family is one prop that knows several forms of itself: three woods by four
 * shapes is twelve barrels from one draw function, and they cannot drift apart
 * in style because they share the geometry and the palette.
 *
 * Axes are crossed to make the variant list, so `{ wood: [3], form: [4] }` is
 * twelve. The family occupies a single entry in the picker — cycling happens
 * there — because four hundred picker cells is a worse library than a hundred.
 */
function defFamily(key, label, cat, opts, draw) {
  const axes = opts.axes || {};
  const names = Object.keys(axes);
  let variants = [{}];
  for (const n of names) {
    const grown = [];
    for (const base of variants) for (const val of axes[n]) grown.push(Object.assign({}, base, { [n]: val }));
    variants = grown;
  }
  if (opts.pick) variants = variants.filter(opts.pick);
  variants.forEach((v, i) => {
    v.i = i;
    v.label = names.map(n => v[n].label || v[n]).join(' ');
    v.over = {};
    // a variant may stand shorter than its family — a broken barrel is a third
    // the height of a whole one, and its shadow has to know
    for (const n of names) if (v[n] && v[n].over) Object.assign(v.over, v[n].over);
  });
  const def = defProp(key, label, cat, Object.assign({}, opts, { variants }),
    (ctx, u, rnd) => draw(ctx, u, rnd, variants[0]));
  def.drawVariant = draw;
  return def;
}

/**
 * The index of a form, choosing the axes you care about and rolling the rest.
 *
 * A tavern wants a long table or a round one — it has no opinion on the wood.
 */
function familyPick(famKey, sel, rng) {
  const fam = PROPS[famKey];
  if (!fam || !fam.variants) return 0;
  const fits = fam.variants.filter(v => Object.keys(sel).every(a => v[a] && v[a].key === sel[a]));
  const pool = fits.length ? fits : fam.variants;
  return pool[rng ? rng.int(0, pool.length - 1) : 0].i;
}

/**
 * An old prop key kept alive as one form of a family.
 *
 * `chair` and `table_long` are written into saved maps, prefab room specs and
 * the generators, and they should go on meaning exactly the chair and the long
 * table they always did. The alias is a real entry in PROPS so all of that
 * keeps working, but it stays out of PROP_LIST, so the picker shows the family
 * once rather than the family plus its ancestors.
 */
function aliasFamily(oldKey, label, familyKey, vi) {
  const d = propDefFor(PROPS[familyKey], vi);
  PROPS[oldKey] = Object.assign(Object.create(d), { key: oldKey, label });
  return PROPS[oldKey];
}

/**
 * The definition as one particular prop wears it.
 *
 * Everything downstream — the artwork, the height, the cached silhouette that
 * js/shading.js throws a shadow from — reads this rather than the family, so a
 * broken barrel gets its own shadow instead of borrowing the upright one's.
 * The distinct `key` is what keeps them out of each other's cache entry.
 */
function propDefFor(def, vi) {
  if (!def || !def.variants) return def;
  const i = Math.max(0, Math.min(def.variants.length - 1, vi | 0));
  const v = def.variants[i];
  if (!v.def) {
    v.def = Object.assign(Object.create(def), v.over, {
      key: def.key + '#' + i,
      variants: null,
      draw: (ctx, u, rnd) => def.drawVariant(ctx, u, rnd, v)
    });
  }
  return v.def;
}

/** Rotation for a newly placed prop: snapped to quarter turns for built objects. */
function propRotation(def, rng) {
  if (def.rand === false) return 0;
  return def.snap ? rng.int(0, 3) * (Math.PI / 2) : rng.range(0, Math.PI * 2);
}

/* ---------- drawing helpers ---------- */

function shp(ctx, fill, stroke, lw) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}
function rectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (r) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function grain(ctx, x, y, w, h, n, col, vertical) {
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, w * 0.012);
  ctx.beginPath();
  for (let i = 1; i < n; i++) {
    if (vertical) { const px = x + (w * i) / n; ctx.moveTo(px, y); ctx.lineTo(px, y + h); }
    else { const py = y + (h * i) / n; ctx.moveTo(x, py); ctx.lineTo(x + w, py); }
  }
  ctx.stroke();
}
function blob(ctx, r, points, jitter, rnd) {
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (1 - jitter / 2 + rnd(i) * jitter);
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
function seededFn(seed) { let s = seed; return (i) => hash2(i, s, 7331); }

const WOOD_D = '#4a3117', WOOD_M = '#6b4a2b', WOOD_L = '#8a6238';
const METAL_D = '#3c4048', METAL_M = '#6b7280', METAL_L = '#9aa3ad';
const OUTLINE = 'rgba(0,0,0,0.55)';

/* ================= Furniture ================= */

const TABLE_WOODS = [
  { key: 'oak', label: 'Oak', top: WOOD_M, face: WOOD_L, dark: WOOD_D },
  { key: 'pine', label: 'Pine', top: '#9c7442', face: '#c19a62', dark: '#6d4f28' },
  { key: 'ebony', label: 'Ebony', top: '#3b2c22', face: '#54402f', dark: '#241a14' }
];
const TABLE_FORMS = [
  { key: 'round', label: 'Round', over: { size: 1.4 } },
  { key: 'long', label: 'Long', over: { size: 2 } },
  { key: 'square', label: 'Square', over: { size: 1.1 } }
];

defFamily('table', 'Table', 'furniture', {
  size: 1.4, h: 0.5,
  axes: { wood: TABLE_WOODS, form: TABLE_FORMS }
}, (ctx, u, rnd, v) => {
  const w = v.wood;
  if (v.form.key === 'round') {
    const r = u * 0.62;
    circ(ctx, 0, 0, r); shp(ctx, w.top, OUTLINE, u * 0.035);
    circ(ctx, 0, 0, r * 0.82); shp(ctx, w.face, 'rgba(0,0,0,0.2)', u * 0.02);
    circ(ctx, -r * 0.2, -r * 0.2, r * 0.28); shp(ctx, 'rgba(255,255,255,0.07)', null);
    return;
  }
  const ww = v.form.key === 'long' ? u * 2.0 : u * 0.95;
  const hh = v.form.key === 'long' ? u * 0.9 : u * 0.95;
  rectPath(ctx, -ww / 2, -hh / 2, ww, hh, u * 0.08); shp(ctx, w.top, OUTLINE, u * 0.035);
  rectPath(ctx, -ww / 2 + u * 0.07, -hh / 2 + u * 0.07, ww - u * 0.14, hh - u * 0.14, u * 0.05);
  shp(ctx, w.face, null);
  grain(ctx, -ww / 2 + u * 0.07, -hh / 2 + u * 0.07, ww - u * 0.14, hh - u * 0.14, 5, 'rgba(0,0,0,0.18)', true);
});

aliasFamily('table_round', 'Round Table', 'table', 0);
aliasFamily('table_long', 'Long Table', 'table', 1);

const SEAT_FORMS = [
  { key: 'chair', label: 'Chair', over: { size: 0.7, h: 0.75 } },
  { key: 'stool', label: 'Stool', over: { size: 0.5, h: 0.35 } },
  { key: 'bench', label: 'Bench', over: { size: 1.6, h: 0.4 } }
];

defFamily('seat', 'Seating', 'furniture', {
  size: 0.7, h: 0.75,
  axes: { wood: TABLE_WOODS, form: SEAT_FORMS }
}, (ctx, u, rnd, v) => {
  const w = v.wood;
  if (v.form.key === 'stool') {
    circ(ctx, 0, 0, u * 0.21); shp(ctx, w.face, OUTLINE, u * 0.03);
    circ(ctx, 0, 0, u * 0.1); shp(ctx, 'rgba(0,0,0,0.18)', null);
    return;
  }
  if (v.form.key === 'bench') {
    const bw = u * 1.5, bh = u * 0.38;
    rectPath(ctx, -bw / 2, -bh / 2, bw, bh, u * 0.04); shp(ctx, w.top, OUTLINE, u * 0.03);
    grain(ctx, -bw / 2, -bh / 2, bw, bh, 3, 'rgba(0,0,0,0.2)', false);
    return;
  }
  const s = u * 0.5;
  rectPath(ctx, -s / 2, -s / 2, s, s, u * 0.05); shp(ctx, w.top, OUTLINE, u * 0.03);
  rectPath(ctx, -s / 2, -s / 2 - u * 0.11, s, u * 0.13, u * 0.04); shp(ctx, w.dark, OUTLINE, u * 0.025);
});

aliasFamily('chair', 'Chair', 'seat', 0);
aliasFamily('stool', 'Stool', 'seat', 1);
aliasFamily('bench', 'Bench', 'seat', 2);

defProp('bed', 'Bed', 'furniture', { size: 2, h: 0.45 }, (ctx, u) => {
  const w = u * 1.05, h = u * 1.9;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.06); shp(ctx, WOOD_D, OUTLINE, u * 0.035);
  rectPath(ctx, -w / 2 + u * 0.06, -h / 2 + u * 0.18, w - u * 0.12, h - u * 0.26, u * 0.05);
  shp(ctx, '#8d6d55', 'rgba(0,0,0,0.25)', u * 0.02);
  rectPath(ctx, -w / 2 + u * 0.06, -h / 2 + u * 0.12, w - u * 0.12, u * 0.34, u * 0.05);
  shp(ctx, '#e2dbc8', 'rgba(0,0,0,0.2)', u * 0.02);
  rectPath(ctx, -w / 2 + u * 0.06, h * 0.02, w - u * 0.12, h * 0.42, u * 0.04);
  shp(ctx, '#7b3f3f', 'rgba(0,0,0,0.2)', u * 0.02);
});

defProp('bookshelf', 'Bookshelf', 'furniture', { size: 1.6, h: 1.2 }, (ctx, u, rnd) => {
  const w = u * 1.5, h = u * 0.55;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.03); shp(ctx, WOOD_D, OUTLINE, u * 0.035);
  const cols = ['#7d3b3b', '#3b5a7d', '#3b7d55', '#7d6b3b', '#5c3b7d'];
  let x = -w / 2 + u * 0.06;
  let i = 0;
  while (x < w / 2 - u * 0.08) {
    const bw = u * (0.05 + rnd(i) * 0.05);
    rectPath(ctx, x, -h / 2 + u * 0.07, bw, h - u * 0.14, 0);
    shp(ctx, cols[Math.floor(rnd(i + 40) * cols.length)], 'rgba(0,0,0,0.3)', u * 0.015);
    x += bw + u * 0.012; i++;
  }
});

defProp('desk', 'Desk', 'furniture', { size: 1.5, h: 0.55 }, (ctx, u) => {
  const w = u * 1.4, h = u * 0.75;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.04); shp(ctx, WOOD_M, OUTLINE, u * 0.035);
  rectPath(ctx, -w * 0.3, -h * 0.24, w * 0.36, h * 0.42, u * 0.02); shp(ctx, '#e8e0c8', 'rgba(0,0,0,0.3)', u * 0.015);
  circ(ctx, w * 0.26, 0, u * 0.06); shp(ctx, '#2b2b33', null);
});

defProp('bar_counter', 'Bar Counter', 'furniture', { size: 3, h: 0.8 }, (ctx, u) => {
  const w = u * 3, h = u * 0.85;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.06); shp(ctx, WOOD_D, OUTLINE, u * 0.04);
  rectPath(ctx, -w / 2 + u * 0.06, -h / 2 + u * 0.06, w - u * 0.12, h - u * 0.12, u * 0.04);
  shp(ctx, WOOD_L, 'rgba(0,0,0,0.25)', u * 0.02);
  grain(ctx, -w / 2 + u * 0.06, -h / 2 + u * 0.06, w - u * 0.12, h - u * 0.12, 8, 'rgba(0,0,0,0.15)', true);
});

defProp('throne', 'Throne', 'furniture', { size: 1.2, h: 0.9 }, (ctx, u) => {
  const s = u * 0.8;
  rectPath(ctx, -s / 2, -s / 2 - u * 0.18, s, s + u * 0.18, u * 0.06); shp(ctx, '#57524a', OUTLINE, u * 0.035);
  rectPath(ctx, -s * 0.34, -s * 0.32, s * 0.68, s * 0.72, u * 0.04); shp(ctx, '#7d2f2f', 'rgba(0,0,0,0.3)', u * 0.02);
  circ(ctx, 0, -s * 0.5, u * 0.09); shp(ctx, '#c9a227', 'rgba(0,0,0,0.35)', u * 0.02);
});

defProp('rug', 'Rug', 'furniture', { size: 2.4, under: true }, (ctx, u, rnd) => {
  const w = u * 2.3, h = u * 1.6;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.03); shp(ctx, '#7a2a2a', 'rgba(0,0,0,0.35)', u * 0.03);
  rectPath(ctx, -w / 2 + u * 0.1, -h / 2 + u * 0.1, w - u * 0.2, h - u * 0.2, 0);
  shp(ctx, null, '#c9a227', u * 0.035);
  rectPath(ctx, -w / 2 + u * 0.22, -h / 2 + u * 0.22, w - u * 0.44, h - u * 0.44, 0);
  shp(ctx, '#8f3535', '#c9a227', u * 0.02);
});

defProp('fireplace', 'Fireplace', 'structure', { size: 2, h: 1.4, light: { range: 5, color: '#ff9d4c', intensity: 0.9 } }, (ctx, u) => {
  const w = u * 1.9, h = u * 0.9;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.04); shp(ctx, '#57524a', OUTLINE, u * 0.04);
  rectPath(ctx, -w * 0.33, -h * 0.16, w * 0.66, h * 0.62, u * 0.04); shp(ctx, '#1c1a18', null);
  ctx.globalAlpha = 0.95;
  blob(ctx, u * 0.24, 9, 0.5, seededFn(3)); ctx.translate(0, h * 0.12);
  shp(ctx, '#ff8a2b', null); ctx.translate(0, -h * 0.12);
  ctx.globalAlpha = 1;
});

/* ================= Containers & dungeon dressing ================= */

const BAND_BRASS = '#b0862f';
const BARREL_WOODS = [
  { key: 'oak', label: 'Oak', stave: WOOD_M, lid: WOOD_L, dark: WOOD_D, band: METAL_M },
  { key: 'pine', label: 'Pine', stave: '#9c7442', lid: '#bb9059', dark: '#6d4f28', band: METAL_M },
  { key: 'ebony', label: 'Ebony', stave: '#3b2c22', lid: '#54402f', dark: '#241a14', band: BAND_BRASS }
];
const BARREL_FORMS = [
  { key: 'shut', label: 'Sealed' },
  { key: 'open', label: 'Open' },
  { key: 'side', label: 'On its side', over: { h: 0.45, size: 1 } },
  { key: 'broken', label: 'Broken', over: { h: 0.3 } }
];

defFamily('barrel', 'Barrel', 'dressing', {
  size: 0.85, h: 0.7,
  axes: { wood: BARREL_WOODS, form: BARREL_FORMS }
}, (ctx, u, rnd, v) => {
  const w = v.wood, r = u * 0.36;
  if (v.form.key === 'side') {
    // lying down: the round end reads as the barrel, the staves run its length
    rectPath(ctx, -u * 0.46, -u * 0.3, u * 0.92, u * 0.6, u * 0.16);
    shp(ctx, w.stave, OUTLINE, u * 0.035);
    grain(ctx, -u * 0.46, -u * 0.28, u * 0.92, u * 0.56, 5, w.dark, false);
    ctx.beginPath();
    ctx.moveTo(-u * 0.16, -u * 0.3); ctx.lineTo(-u * 0.16, u * 0.3);
    ctx.moveTo(u * 0.16, -u * 0.3); ctx.lineTo(u * 0.16, u * 0.3);
    shp(ctx, null, w.band, u * 0.05);
    circ(ctx, u * 0.31, 0, u * 0.17); shp(ctx, w.lid, OUTLINE, u * 0.03);
    return;
  }
  if (v.form.key === 'broken') {
    // what is left standing is a jagged stump of staves with the rest fallen
    // clear of it — evenly splayed spokes read as a sun, not as wreckage
    const rn = rnd || (() => 0.5);
    ctx.save(); ctx.rotate(rn(3) * Math.PI * 2);
    for (let i = 0; i < 5; i++) {
      const a = -0.5 + i * 0.42 + rn(i) * 0.22;
      const len = r * (0.5 + rn(i + 5) * 0.75);
      ctx.save(); ctx.rotate(a);
      rectPath(ctx, -u * 0.055, -r * 0.15, u * 0.11, -len, u * 0.03);
      shp(ctx, i % 2 ? w.stave : w.lid, OUTLINE, u * 0.022);
      ctx.restore();
    }
    // the shattered base, open where the staves have gone
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.66, 0.5, Math.PI * 2 - 0.35);
    ctx.closePath();
    shp(ctx, w.dark, OUTLINE, u * 0.03);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.66, 0.7, Math.PI * 1.7);
    shp(ctx, null, w.band, u * 0.035);
    // debris, well clear of the stump so the silhouette breaks up
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(Math.cos(rn(i + 11) * 6.3) * r * 1.15, Math.sin(rn(i + 17) * 6.3) * r * 1.15);
      ctx.rotate(rn(i + 23) * 3);
      rectPath(ctx, -u * 0.09, -u * 0.03, u * 0.18, u * 0.06, u * 0.02);
      shp(ctx, w.stave, OUTLINE, u * 0.018);
      ctx.restore();
    }
    ctx.restore();          // balances the rotate above: a leaked save here
    return;                 // corrupts the transform for every later prop
  }
  circ(ctx, 0, 0, r); shp(ctx, w.stave, OUTLINE, u * 0.035);
  circ(ctx, 0, 0, r * 0.8); shp(ctx, null, w.band, u * 0.045);
  if (v.form.key === 'open') {
    circ(ctx, 0, 0, r * 0.62); shp(ctx, w.dark, 'rgba(0,0,0,0.45)', u * 0.025);
    circ(ctx, 0, 0, r * 0.46); shp(ctx, 'rgba(0,0,0,0.35)', null);
  } else {
    circ(ctx, 0, 0, r * 0.44); shp(ctx, w.lid, 'rgba(0,0,0,0.3)', u * 0.02);
  }
});

defProp('keg', 'Keg', 'dressing', { size: 0.9, h: 0.5 }, (ctx, u) => {
  rectPath(ctx, -u * 0.42, -u * 0.3, u * 0.84, u * 0.6, u * 0.14); shp(ctx, WOOD_M, OUTLINE, u * 0.035);
  ctx.beginPath(); ctx.moveTo(-u * 0.14, -u * 0.3); ctx.lineTo(-u * 0.14, u * 0.3);
  ctx.moveTo(u * 0.14, -u * 0.3); ctx.lineTo(u * 0.14, u * 0.3);
  shp(ctx, null, METAL_M, u * 0.05);
});

const CRATE_WOODS = [
  { key: 'pine', label: 'Pine', board: WOOD_L, dark: WOOD_D, iron: null },
  { key: 'oak', label: 'Oak', board: WOOD_M, dark: WOOD_D, iron: null },
  { key: 'bound', label: 'Iron-bound', board: '#6b543a', dark: '#3a2c1c', iron: METAL_M }
];
const CRATE_FORMS = [
  { key: 'shut', label: 'Nailed shut' },
  { key: 'open', label: 'Open' },
  { key: 'tipped', label: 'Tipped over', over: { h: 0.45 } },
  { key: 'broken', label: 'Broken', over: { h: 0.35 } }
];

defFamily('crate', 'Crate', 'dressing', {
  size: 0.9, h: 0.6,
  axes: { wood: CRATE_WOODS, form: CRATE_FORMS }
}, (ctx, u, rnd, v) => {
  const w = v.wood, s = u * 0.72, rn = rnd || (() => 0.5);
  if (v.form.key === 'broken') {
    // a burst crate: the lid split and the boards sprung off one corner
    ctx.save();
    ctx.rotate(rn(2) * 0.6 - 0.3);
    rectPath(ctx, -s / 2, -s / 2, s, s * 0.82, u * 0.03); shp(ctx, w.dark, OUTLINE, u * 0.03);
    for (let i = 0; i < 4; i++) {
      const y = -s / 2 + i * s * 0.2 + rn(i) * u * 0.03;
      rectPath(ctx, -s / 2 + rn(i + 4) * u * 0.1, y, s * (0.6 + rn(i + 8) * 0.45), s * 0.15, u * 0.02);
      shp(ctx, w.board, OUTLINE, u * 0.02);
    }
    ctx.restore();
    for (let i = 0; i < 2; i++) {
      ctx.save();
      ctx.translate((rn(i + 12) - 0.5) * s * 1.7, (rn(i + 15) - 0.5) * s * 1.7);
      ctx.rotate(rn(i + 18) * 3);
      rectPath(ctx, -u * 0.12, -u * 0.035, u * 0.24, u * 0.07, u * 0.02);
      shp(ctx, w.board, OUTLINE, u * 0.018);
      ctx.restore();
    }
    return;
  }
  if (v.form.key === 'tipped') {
    // on its side: you see the open mouth and the boards running away from you
    rectPath(ctx, -s * 0.62, -s / 2, s * 1.24, s, u * 0.03); shp(ctx, w.board, OUTLINE, u * 0.035);
    grain(ctx, -s * 0.62, -s / 2, s * 1.24, s, 4, 'rgba(0,0,0,0.22)', false);
    rectPath(ctx, s * 0.16, -s * 0.42, s * 0.42, s * 0.84, u * 0.03);
    shp(ctx, w.dark, 'rgba(0,0,0,0.45)', u * 0.025);
    if (w.iron) { rectPath(ctx, -s * 0.6, -s * 0.46, s * 0.12, s * 0.92, u * 0.02); shp(ctx, w.iron, null); }
    return;
  }
  rectPath(ctx, -s / 2, -s / 2, s, s, u * 0.03); shp(ctx, w.board, OUTLINE, u * 0.035);
  if (v.form.key === 'open') {
    rectPath(ctx, -s * 0.38, -s * 0.38, s * 0.76, s * 0.76, u * 0.02);
    shp(ctx, w.dark, 'rgba(0,0,0,0.4)', u * 0.025);
    rectPath(ctx, -s * 0.26, -s * 0.26, s * 0.52, s * 0.52, u * 0.02);
    shp(ctx, 'rgba(0,0,0,0.3)', null);
  } else {
    ctx.beginPath();
    ctx.moveTo(-s / 2, -s / 2); ctx.lineTo(s / 2, s / 2);
    ctx.moveTo(s / 2, -s / 2); ctx.lineTo(-s / 2, s / 2);
    shp(ctx, null, 'rgba(0,0,0,0.35)', u * 0.03);
  }
  if (w.iron) {
    rectPath(ctx, -s / 2, -s / 2, s, s, u * 0.03);
    shp(ctx, null, w.iron, u * 0.045);
  }
});

defProp('chest', 'Chest', 'dressing', { size: 1, h: 0.5 }, (ctx, u) => {
  const w = u * 0.8, h = u * 0.55;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.04); shp(ctx, WOOD_D, OUTLINE, u * 0.035);
  rectPath(ctx, -w / 2 + u * 0.05, -h / 2 + u * 0.05, w - u * 0.1, h - u * 0.1, u * 0.03);
  shp(ctx, WOOD_M, null);
  rectPath(ctx, -u * 0.07, -h / 2, u * 0.14, h, 0); shp(ctx, '#c9a227', 'rgba(0,0,0,0.35)', u * 0.02);
});

defProp('sack', 'Sack', 'dressing', { size: 0.6, h: 0.45 }, (ctx, u, rnd) => {
  blob(ctx, u * 0.25, 8, 0.35, rnd); shp(ctx, '#a3906a', OUTLINE, u * 0.03);
  circ(ctx, 0, -u * 0.14, u * 0.07); shp(ctx, '#7d6d4f', null);
});

defProp('pot', 'Clay Pot', 'dressing', { size: 0.55, h: 0.4 }, (ctx, u) => {
  circ(ctx, 0, 0, u * 0.2); shp(ctx, '#a3603f', OUTLINE, u * 0.03);
  circ(ctx, 0, 0, u * 0.1); shp(ctx, '#3a2418', null);
});

defProp('bones', 'Bones', 'dressing', { size: 0.8, h: 0.12 }, (ctx, u, rnd) => {
  ctx.strokeStyle = '#ddd6c2'; ctx.lineWidth = u * 0.055; ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const a = rnd(i) * Math.PI * 2, l = u * (0.1 + rnd(i + 9) * 0.2);
    const cx = (rnd(i + 3) - 0.5) * u * 0.4, cy = (rnd(i + 6) - 0.5) * u * 0.4;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * l, cy - Math.sin(a) * l);
    ctx.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
    ctx.stroke();
  }
});

defProp('skull', 'Skull', 'dressing', { size: 0.5, h: 0.18 }, (ctx, u) => {
  circ(ctx, 0, -u * 0.02, u * 0.17); shp(ctx, '#e4ddca', 'rgba(0,0,0,0.4)', u * 0.02);
  circ(ctx, -u * 0.06, -u * 0.02, u * 0.045); shp(ctx, '#2a2620', null);
  circ(ctx, u * 0.06, -u * 0.02, u * 0.045); shp(ctx, '#2a2620', null);
  rectPath(ctx, -u * 0.07, u * 0.1, u * 0.14, u * 0.07, u * 0.02); shp(ctx, '#e4ddca', 'rgba(0,0,0,0.35)', u * 0.015);
});

defProp('rubble_pile', 'Rubble Pile', 'dressing', { size: 1, h: 0.35 }, (ctx, u, rnd) => {
  for (let i = 0; i < 7; i++) {
    const cx = (rnd(i) - 0.5) * u * 0.7, cy = (rnd(i + 11) - 0.5) * u * 0.7;
    ctx.save(); ctx.translate(cx, cy);
    blob(ctx, u * (0.06 + rnd(i + 5) * 0.09), 6, 0.5, seededFn(i));
    shp(ctx, rgb(mixRGB([90, 85, 76], [130, 124, 112], rnd(i + 21))), 'rgba(0,0,0,0.35)', u * 0.018);
    ctx.restore();
  }
});

defProp('pillar', 'Pillar', 'structure', { size: 1, h: 2.4, blocks: true }, (ctx, u) => {
  circ(ctx, 0, 0, u * 0.4); shp(ctx, '#6f6a60', 'rgba(0,0,0,0.6)', u * 0.045);
  circ(ctx, 0, 0, u * 0.29); shp(ctx, '#8b8578', 'rgba(0,0,0,0.25)', u * 0.02);
  circ(ctx, -u * 0.09, -u * 0.09, u * 0.12); shp(ctx, 'rgba(255,255,255,0.09)', null);
});

defProp('pillar_broken', 'Broken Pillar', 'structure', { size: 0.9, h: 0.9 }, (ctx, u, rnd) => {
  blob(ctx, u * 0.32, 9, 0.4, rnd); shp(ctx, '#6f6a60', 'rgba(0,0,0,0.5)', u * 0.04);
  blob(ctx, u * 0.19, 8, 0.35, seededFn(4)); shp(ctx, '#565149', null);
});

defProp('statue', 'Statue', 'structure', { size: 1, h: 1.7, blocks: true }, (ctx, u) => {
  circ(ctx, 0, 0, u * 0.4); shp(ctx, '#5e594f', 'rgba(0,0,0,0.55)', u * 0.04);
  ctx.save();
  ctx.fillStyle = '#9c968a';
  circ(ctx, 0, -u * 0.13, u * 0.1); ctx.fill();
  rectPath(ctx, -u * 0.12, -u * 0.05, u * 0.24, u * 0.3, u * 0.06); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = u * 0.02; ctx.stroke();
  ctx.restore();
});

defProp('altar', 'Altar', 'structure', { size: 1.6, h: 0.8 }, (ctx, u) => {
  const w = u * 1.4, h = u * 0.8;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.04); shp(ctx, '#5e594f', 'rgba(0,0,0,0.6)', u * 0.045);
  rectPath(ctx, -w / 2 + u * 0.08, -h / 2 + u * 0.08, w - u * 0.16, h - u * 0.16, u * 0.03);
  shp(ctx, '#8b8578', 'rgba(0,0,0,0.25)', u * 0.02);
  circ(ctx, 0, 0, u * 0.14); shp(ctx, '#7a2a2a', 'rgba(0,0,0,0.4)', u * 0.025);
});

defProp('sarcophagus', 'Sarcophagus', 'structure', { size: 2, h: 0.7 }, (ctx, u) => {
  const w = u * 0.95, h = u * 1.9;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.1); shp(ctx, '#6a655b', 'rgba(0,0,0,0.6)', u * 0.045);
  rectPath(ctx, -w / 2 + u * 0.08, -h / 2 + u * 0.08, w - u * 0.16, h - u * 0.16, u * 0.08);
  shp(ctx, '#898274', 'rgba(0,0,0,0.3)', u * 0.02);
  circ(ctx, 0, -h * 0.28, u * 0.13); shp(ctx, '#6a655b', 'rgba(0,0,0,0.3)', u * 0.02);
  rectPath(ctx, -u * 0.04, -h * 0.12, u * 0.08, h * 0.42, u * 0.02); shp(ctx, '#6a655b', null);
});

defProp('coffin', 'Coffin', 'structure', { size: 1.8, h: 0.45 }, (ctx, u) => {
  const w = u * 0.75, h = u * 1.7;
  ctx.beginPath();
  ctx.moveTo(-w * 0.35, -h / 2); ctx.lineTo(w * 0.35, -h / 2);
  ctx.lineTo(w / 2, -h * 0.2); ctx.lineTo(w * 0.3, h / 2);
  ctx.lineTo(-w * 0.3, h / 2); ctx.lineTo(-w / 2, -h * 0.2);
  ctx.closePath(); shp(ctx, WOOD_D, 'rgba(0,0,0,0.55)', u * 0.04);
  grain(ctx, -w / 2, -h / 2, w, h, 4, 'rgba(0,0,0,0.25)', true);
});

defProp('gravestone', 'Gravestone', 'structure', { size: 0.8, h: 0.7 }, (ctx, u) => {
  ctx.beginPath(); ctx.moveTo(-u * 0.2, u * 0.25); ctx.lineTo(-u * 0.2, -u * 0.1);
  ctx.arc(0, -u * 0.1, u * 0.2, Math.PI, 0); ctx.lineTo(u * 0.2, u * 0.25); ctx.closePath();
  shp(ctx, '#7a746a', 'rgba(0,0,0,0.5)', u * 0.035);
  ctx.beginPath(); ctx.moveTo(0, -u * 0.16); ctx.lineTo(0, u * 0.08);
  ctx.moveTo(-u * 0.07, -u * 0.06); ctx.lineTo(u * 0.07, -u * 0.06);
  shp(ctx, null, 'rgba(0,0,0,0.3)', u * 0.03);
});

defProp('anvil', 'Anvil', 'dressing', { size: 0.9, h: 0.5 }, (ctx, u) => {
  ctx.beginPath();
  ctx.moveTo(-u * 0.34, -u * 0.12); ctx.lineTo(u * 0.36, -u * 0.08);
  ctx.lineTo(u * 0.2, u * 0.06); ctx.lineTo(u * 0.16, u * 0.2);
  ctx.lineTo(-u * 0.18, u * 0.2); ctx.lineTo(-u * 0.22, u * 0.04);
  ctx.closePath(); shp(ctx, METAL_D, 'rgba(0,0,0,0.5)', u * 0.035);
  ctx.beginPath(); ctx.moveTo(-u * 0.3, -u * 0.1); ctx.lineTo(u * 0.3, -u * 0.07);
  shp(ctx, null, METAL_L, u * 0.03);
});

defProp('weapon_rack', 'Weapon Rack', 'dressing', { size: 1.3, h: 1.1 }, (ctx, u) => {
  const w = u * 1.2, h = u * 0.35;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.03); shp(ctx, WOOD_D, OUTLINE, u * 0.03);
  ctx.strokeStyle = METAL_L; ctx.lineWidth = u * 0.04;
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + w * (i + 0.5) / 4;
    ctx.beginPath(); ctx.moveTo(x, -h * 0.7); ctx.lineTo(x, h * 0.7); ctx.stroke();
  }
});

defProp('cauldron', 'Cauldron', 'dressing', { size: 0.9, h: 0.6 }, (ctx, u) => {
  circ(ctx, 0, 0, u * 0.33); shp(ctx, '#2e3238', 'rgba(0,0,0,0.55)', u * 0.04);
  circ(ctx, 0, 0, u * 0.24); shp(ctx, '#4a7a4f', 'rgba(0,0,0,0.3)', u * 0.02);
  circ(ctx, -u * 0.07, -u * 0.06, u * 0.06); shp(ctx, 'rgba(255,255,255,0.12)', null);
});

defProp('cart', 'Cart', 'dressing', { size: 2, h: 0.7 }, (ctx, u) => {
  const w = u * 1.7, h = u * 0.95;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.04); shp(ctx, WOOD_M, OUTLINE, u * 0.04);
  rectPath(ctx, -w / 2 + u * 0.08, -h / 2 + u * 0.08, w - u * 0.16, h - u * 0.16, u * 0.02);
  shp(ctx, WOOD_D, null);
  grain(ctx, -w / 2 + u * 0.08, -h / 2 + u * 0.08, w - u * 0.16, h - u * 0.16, 6, 'rgba(0,0,0,0.25)', true);
  for (const sy of [-1, 1]) { circ(ctx, -w * 0.18, sy * h * 0.56, u * 0.2); shp(ctx, '#3a2a1c', 'rgba(0,0,0,0.5)', u * 0.03); }
});

defProp('ladder', 'Ladder', 'structure', { size: 1.6, h: 0.15 }, (ctx, u) => {
  const w = u * 0.5, h = u * 1.5;
  ctx.strokeStyle = WOOD_L; ctx.lineWidth = u * 0.07;
  ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(-w / 2, h / 2);
  ctx.moveTo(w / 2, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.stroke();
  ctx.lineWidth = u * 0.05;
  for (let i = 0; i <= 5; i++) {
    const y = -h / 2 + (h * i) / 5;
    ctx.beginPath(); ctx.moveTo(-w / 2, y); ctx.lineTo(w / 2, y); ctx.stroke();
  }
});

defProp('stairs_up', 'Stairs', 'structure', { size: 2, h: 0.3 }, (ctx, u) => {
  const w = u * 1.5, h = u * 1.9;
  rectPath(ctx, -w / 2, -h / 2, w, h, 0); shp(ctx, '#6b6559', 'rgba(0,0,0,0.5)', u * 0.04);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = u * 0.035;
  for (let i = 1; i < 7; i++) {
    const y = -h / 2 + (h * i) / 7;
    ctx.beginPath(); ctx.moveTo(-w / 2, y); ctx.lineTo(w / 2, y); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
});

defProp('well', 'Well', 'structure', { size: 1.5, h: 0.8, blocks: true }, (ctx, u) => {
  circ(ctx, 0, 0, u * 0.62); shp(ctx, '#6b6559', 'rgba(0,0,0,0.55)', u * 0.05);
  circ(ctx, 0, 0, u * 0.46); shp(ctx, '#4a463f', null);
  circ(ctx, 0, 0, u * 0.34); shp(ctx, '#1b2a33', null);
  circ(ctx, -u * 0.1, -u * 0.1, u * 0.09); shp(ctx, 'rgba(120,190,220,0.25)', null);
});

defProp('fountain', 'Fountain', 'structure', { size: 2, h: 0.7, blocks: true }, (ctx, u) => {
  circ(ctx, 0, 0, u * 0.9); shp(ctx, '#7a746a', 'rgba(0,0,0,0.5)', u * 0.05);
  circ(ctx, 0, 0, u * 0.72); shp(ctx, '#35708a', 'rgba(0,0,0,0.3)', u * 0.03);
  circ(ctx, 0, 0, u * 0.24); shp(ctx, '#8b8578', 'rgba(0,0,0,0.35)', u * 0.03);
  circ(ctx, -u * 0.25, -u * 0.25, u * 0.16); shp(ctx, 'rgba(255,255,255,0.14)', null);
});

defProp('cage', 'Cage', 'structure', { size: 1.3, h: 1.7 }, (ctx, u) => {
  const s = u * 1.05;
  rectPath(ctx, -s / 2, -s / 2, s, s, u * 0.04); shp(ctx, 'rgba(20,20,24,0.5)', METAL_D, u * 0.05);
  ctx.strokeStyle = METAL_M; ctx.lineWidth = u * 0.035;
  for (let i = 1; i < 5; i++) {
    const x = -s / 2 + (s * i) / 5;
    ctx.beginPath(); ctx.moveTo(x, -s / 2); ctx.lineTo(x, s / 2); ctx.stroke();
  }
});

defProp('banner', 'Banner', 'structure', { size: 1, h: 0.1 }, (ctx, u) => {
  const w = u * 0.5, h = u * 0.9;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(w / 2, h * 0.3);
  ctx.lineTo(0, h / 2); ctx.lineTo(-w / 2, h * 0.3); ctx.closePath();
  shp(ctx, '#6b2230', 'rgba(0,0,0,0.45)', u * 0.03);
  circ(ctx, 0, -h * 0.08, u * 0.1); shp(ctx, '#c9a227', null);
});

defProp('spiderweb', 'Spider Web', 'dressing', { size: 1.4, under: true }, (ctx, u) => {
  ctx.strokeStyle = 'rgba(228,228,235,0.5)'; ctx.lineWidth = u * 0.02;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * u * 0.65, Math.sin(a) * u * 0.65); ctx.stroke();
  }
  for (let r = 0.18; r < 0.7; r += 0.16) {
    ctx.beginPath();
    for (let i = 0; i <= 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const px = Math.cos(a) * u * r, py = Math.sin(a) * u * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
  }
});

/* ================= Lights ================= */

defProp('brazier', 'Brazier', 'light', { size: 0.9, h: 0.8, light: { range: 4.5, color: '#ff9d4c', intensity: 1 } }, (ctx, u) => {
  circ(ctx, 0, 0, u * 0.34); shp(ctx, '#3c4048', 'rgba(0,0,0,0.55)', u * 0.04);
  circ(ctx, 0, 0, u * 0.24); shp(ctx, '#ff7a1a', null);
  circ(ctx, 0, 0, u * 0.13); shp(ctx, '#ffe08a', null);
});

defProp('campfire', 'Campfire', 'light', { size: 1, h: 0.3, light: { range: 5, color: '#ff8f3c', intensity: 1 } }, (ctx, u, rnd) => {
  // ring of stones
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rnd(i) * 0.3;
    circ(ctx, Math.cos(a) * u * 0.34, Math.sin(a) * u * 0.34, u * (0.055 + rnd(i + 5) * 0.03));
    shp(ctx, '#6d675d', 'rgba(0,0,0,0.4)', u * 0.018);
  }
  // logs stacked into the fire, not spokes
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = u * 0.06; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI + 0.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * u * 0.22, Math.sin(a) * u * 0.22);
    ctx.lineTo(-Math.cos(a) * u * 0.22, -Math.sin(a) * u * 0.22);
    ctx.stroke();
  }
  blob(ctx, u * 0.19, 9, 0.5, rnd); shp(ctx, '#ff7a1a', null);
  blob(ctx, u * 0.1, 7, 0.5, seededFn(2)); shp(ctx, '#ffe08a', null);
});

defProp('torch', 'Wall Torch', 'light', { size: 0.5, h: 0.35, light: { range: 4, color: '#ff9d4c', intensity: 0.85 } }, (ctx, u) => {
  rectPath(ctx, -u * 0.05, -u * 0.02, u * 0.1, u * 0.26, u * 0.02); shp(ctx, WOOD_D, 'rgba(0,0,0,0.4)', u * 0.02);
  circ(ctx, 0, -u * 0.08, u * 0.13); shp(ctx, '#ff7a1a', null);
  circ(ctx, 0, -u * 0.09, u * 0.07); shp(ctx, '#ffe8a8', null);
});

defProp('lantern', 'Lantern', 'light', { size: 0.5, h: 0.3, light: { range: 3.5, color: '#ffd08a', intensity: 0.8 } }, (ctx, u) => {
  rectPath(ctx, -u * 0.11, -u * 0.13, u * 0.22, u * 0.26, u * 0.04); shp(ctx, METAL_D, 'rgba(0,0,0,0.45)', u * 0.025);
  rectPath(ctx, -u * 0.06, -u * 0.08, u * 0.12, u * 0.16, u * 0.02); shp(ctx, '#ffdf9e', null);
});

defProp('candles', 'Candles', 'light', { size: 0.4, h: 0.2, light: { range: 2, color: '#ffe0a0', intensity: 0.5 } }, (ctx, u, rnd) => {
  for (let i = 0; i < 3; i++) {
    const cx = (rnd(i) - 0.5) * u * 0.25, cy = (rnd(i + 5) - 0.5) * u * 0.25;
    circ(ctx, cx, cy, u * 0.05); shp(ctx, '#efe6cd', 'rgba(0,0,0,0.35)', u * 0.015);
    circ(ctx, cx, cy, u * 0.022); shp(ctx, '#ffd76b', null);
  }
});

defProp('crystal', 'Glowing Crystal', 'light', { size: 0.8, h: 0.5, light: { range: 4, color: '#7fd8ff', intensity: 0.8 } }, (ctx, u, rnd) => {
  for (let i = 0; i < 3; i++) {
    const a = rnd(i) * Math.PI * 2, d = u * 0.12;
    ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d); ctx.rotate(rnd(i + 3) * Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -u * 0.24); ctx.lineTo(u * 0.1, 0); ctx.lineTo(0, u * 0.2); ctx.lineTo(-u * 0.1, 0);
    ctx.closePath(); shp(ctx, '#6fc6e8', 'rgba(255,255,255,0.5)', u * 0.02);
    ctx.restore();
  }
});

/* ================= Nature ================= */

function drawFoliage(ctx, u, rnd, cols, r) {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rnd(i) * 0.7;
    const d = r * (0.18 + rnd(i + 4) * 0.3);
    ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
    blob(ctx, r * (0.5 + rnd(i + 8) * 0.28), 9, 0.35, seededFn(i * 13));
    shp(ctx, cols[i % cols.length], null);
    ctx.restore();
  }
}

defProp('tree_oak', 'Oak Tree', 'nature', { size: 2.2, h: 3.2, blocks: true }, (ctx, u, rnd) => {
  drawFoliage(ctx, u, rnd, ['#2f5a28', '#3c7033', '#4a8a3d', '#356b2d'], u * 0.95);
  circ(ctx, 0, 0, u * 0.16); shp(ctx, '#4a3320', null);
});

defProp('tree_pine', 'Pine Tree', 'nature', { size: 1.8, h: 3.6, blocks: true }, (ctx, u, rnd) => {
  // three tiers of needle-fringed boughs, each turned a little
  const tiers = [[0.80, '#1d4524'], [0.60, '#2a5c30'], [0.40, '#38743d']];
  tiers.forEach(([f, col], i) => {
    const r = u * f, spikes = 13, twist = i * 0.24;
    ctx.beginPath();
    for (let k = 0; k <= spikes * 2; k++) {
      const a = (k / (spikes * 2)) * Math.PI * 2 + twist;
      const rr = r * (k % 2 === 0 ? 1 : 0.52);
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    shp(ctx, col, i === 0 ? 'rgba(0,0,0,0.35)' : null, u * 0.02);
  });
  circ(ctx, 0, 0, u * 0.07); shp(ctx, '#4a3a26', null);
});

defProp('tree_dead', 'Dead Tree', 'nature', { size: 1.8, h: 2.6, blocks: true }, (ctx, u, rnd) => {
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd(i) * 0.5;
    const l = u * (0.34 + rnd(i + 3) * 0.36);
    // thick limb tapering into thin twigs
    ctx.strokeStyle = '#463b2e'; ctx.lineWidth = u * 0.1;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(Math.cos(a) * l * 0.55, Math.sin(a) * l * 0.55,
      Math.cos(a + 0.35) * l, Math.sin(a + 0.35) * l);
    ctx.stroke();
    ctx.strokeStyle = '#5a4c3b'; ctx.lineWidth = u * 0.035;
    for (const s of [-0.5, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a + 0.3) * l * 0.8, Math.sin(a + 0.3) * l * 0.8);
      ctx.lineTo(Math.cos(a + 0.35 + s * 0.4) * l * 1.25, Math.sin(a + 0.35 + s * 0.4) * l * 1.25);
      ctx.stroke();
    }
  }
  circ(ctx, 0, 0, u * 0.17); shp(ctx, '#3d3428', 'rgba(0,0,0,0.45)', u * 0.025);
  circ(ctx, 0, 0, u * 0.08); shp(ctx, '#2a241b', null);
});

defProp('palm', 'Palm Tree', 'nature', { size: 1.8, h: 3, blocks: true }, (ctx, u, rnd) => {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd(i) * 0.4;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(Math.cos(a) * u * 0.4, Math.sin(a) * u * 0.4,
      Math.cos(a + 0.3) * u * 0.8, Math.sin(a + 0.3) * u * 0.8);
    ctx.lineTo(Math.cos(a - 0.15) * u * 0.75, Math.sin(a - 0.15) * u * 0.75);
    ctx.closePath(); shp(ctx, i % 2 ? '#3d7a3a' : '#4d8f45', 'rgba(0,0,0,0.2)', u * 0.015);
  }
  circ(ctx, 0, 0, u * 0.12); shp(ctx, '#6b4f30', null);
});

defProp('bush', 'Bush', 'nature', { size: 1, h: 0.6 }, (ctx, u, rnd) => {
  drawFoliage(ctx, u, rnd, ['#37652e', '#437a38', '#4f8f42'], u * 0.42);
});

defProp('flowers', 'Flowers', 'nature', { size: 0.7, under: true }, (ctx, u, rnd) => {
  const cols = ['#e8d34a', '#e07ba8', '#9a7fe0', '#e8e8e8'];
  for (let i = 0; i < 6; i++) {
    const cx = (rnd(i) - 0.5) * u * 0.6, cy = (rnd(i + 7) - 0.5) * u * 0.6;
    circ(ctx, cx, cy, u * 0.045); shp(ctx, cols[Math.floor(rnd(i + 3) * cols.length)], null);
  }
});

defProp('rock', 'Boulder', 'nature', { size: 1.1, h: 0.8, blocks: true }, (ctx, u, rnd) => {
  blob(ctx, u * 0.42, 8, 0.35, rnd); shp(ctx, '#6d675d', 'rgba(0,0,0,0.45)', u * 0.03);
  ctx.save(); ctx.translate(-u * 0.08, -u * 0.08);
  blob(ctx, u * 0.2, 7, 0.4, seededFn(11)); shp(ctx, 'rgba(255,255,255,0.1)', null); ctx.restore();
});

defProp('rock_small', 'Small Rocks', 'nature', { size: 0.7, h: 0.25 }, (ctx, u, rnd) => {
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate((rnd(i) - 0.5) * u * 0.5, (rnd(i + 6) - 0.5) * u * 0.5);
    blob(ctx, u * (0.08 + rnd(i + 2) * 0.07), 7, 0.4, seededFn(i * 7));
    shp(ctx, '#6d675d', 'rgba(0,0,0,0.4)', u * 0.02);
    ctx.restore();
  }
});

defProp('stalagmite', 'Stalagmite', 'nature', { size: 0.9, h: 1.4, blocks: true }, (ctx, u, rnd) => {
  for (let i = 0; i < 3; i++) {
    const cx = (rnd(i) - 0.5) * u * 0.4, cy = (rnd(i + 4) - 0.5) * u * 0.4;
    ctx.save(); ctx.translate(cx, cy);
    blob(ctx, u * (0.1 + rnd(i + 8) * 0.1), 7, 0.3, seededFn(i * 5));
    shp(ctx, '#5b554c', 'rgba(0,0,0,0.5)', u * 0.025);
    circ(ctx, 0, 0, u * 0.04); shp(ctx, '#8a8377', null);
    ctx.restore();
  }
});

defProp('mushroom', 'Mushrooms', 'nature', { size: 0.6, h: 0.2 }, (ctx, u, rnd) => {
  for (let i = 0; i < 3; i++) {
    const cx = (rnd(i) - 0.5) * u * 0.4, cy = (rnd(i + 3) - 0.5) * u * 0.4;
    circ(ctx, cx, cy, u * (0.06 + rnd(i + 9) * 0.05));
    shp(ctx, i % 2 ? '#8a4a6b' : '#b06a4a', 'rgba(0,0,0,0.35)', u * 0.015);
  }
});

defProp('mushroom_glow', 'Glowing Mushrooms', 'light', { size: 0.7, h: 0.3, light: { range: 2.5, color: '#7fffd4', intensity: 0.5 } }, (ctx, u, rnd) => {
  for (let i = 0; i < 4; i++) {
    const cx = (rnd(i) - 0.5) * u * 0.5, cy = (rnd(i + 3) - 0.5) * u * 0.5;
    circ(ctx, cx, cy, u * (0.05 + rnd(i + 9) * 0.05));
    shp(ctx, '#6fe3c0', 'rgba(255,255,255,0.4)', u * 0.015);
  }
});

defProp('reeds', 'Reeds', 'nature', { size: 0.8, h: 0.6 }, (ctx, u, rnd) => {
  ctx.strokeStyle = '#6f8a3f'; ctx.lineWidth = u * 0.025; ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const cx = (rnd(i) - 0.5) * u * 0.6;
    ctx.beginPath(); ctx.moveTo(cx, u * 0.25);
    ctx.quadraticCurveTo(cx + (rnd(i + 4) - 0.5) * u * 0.2, 0, cx + (rnd(i + 9) - 0.5) * u * 0.3, -u * 0.3);
    ctx.stroke();
  }
});

defProp('lilypad', 'Lily Pads', 'nature', { size: 0.9, under: true }, (ctx, u, rnd) => {
  for (let i = 0; i < 3; i++) {
    const cx = (rnd(i) - 0.5) * u * 0.55, cy = (rnd(i + 5) - 0.5) * u * 0.55;
    const r = u * (0.1 + rnd(i + 2) * 0.08);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0.5, Math.PI * 2 + 0.2); ctx.lineTo(cx, cy); ctx.closePath();
    shp(ctx, '#3f7a3a', 'rgba(0,0,0,0.3)', u * 0.015);
  }
});

defProp('log', 'Fallen Log', 'nature', { size: 1.6, h: 0.4 }, (ctx, u) => {
  const w = u * 1.5, h = u * 0.32;
  rectPath(ctx, -w / 2, -h / 2, w, h, h / 2); shp(ctx, '#5a4128', 'rgba(0,0,0,0.45)', u * 0.03);
  circ(ctx, -w / 2 + h * 0.4, 0, h * 0.38); shp(ctx, '#7d5c3a', 'rgba(0,0,0,0.3)', u * 0.02);
  grain(ctx, -w / 2, -h / 2, w, h, 3, 'rgba(0,0,0,0.2)', false);
});

defProp('stump', 'Tree Stump', 'nature', { size: 0.8, h: 0.3 }, (ctx, u) => {
  circ(ctx, 0, 0, u * 0.28); shp(ctx, '#5a4128', 'rgba(0,0,0,0.45)', u * 0.03);
  circ(ctx, 0, 0, u * 0.2); shp(ctx, '#7d5c3a', null);
  circ(ctx, 0, 0, u * 0.1); shp(ctx, null, 'rgba(0,0,0,0.25)', u * 0.02);
});

defProp('cactus', 'Cactus', 'nature', { size: 1, h: 1.3, blocks: true }, (ctx, u) => {
  ctx.fillStyle = '#3f7a4a'; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = u * 0.03;
  rectPath(ctx, -u * 0.1, -u * 0.3, u * 0.2, u * 0.6, u * 0.1); ctx.fill(); ctx.stroke();
  rectPath(ctx, -u * 0.3, -u * 0.1, u * 0.2, u * 0.14, u * 0.06); ctx.fill(); ctx.stroke();
  rectPath(ctx, u * 0.1, -u * 0.2, u * 0.2, u * 0.14, u * 0.06); ctx.fill(); ctx.stroke();
});

defProp('ice_shard', 'Ice Shard', 'nature', { size: 1, h: 1.2, blocks: true }, (ctx, u, rnd) => {
  for (let i = 0; i < 3; i++) {
    ctx.save(); ctx.rotate(rnd(i) * Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -u * 0.4); ctx.lineTo(u * 0.15, u * 0.1); ctx.lineTo(0, u * 0.3); ctx.lineTo(-u * 0.15, u * 0.1);
    ctx.closePath(); shp(ctx, 'rgba(180,225,240,0.8)', 'rgba(255,255,255,0.6)', u * 0.02);
    ctx.restore();
  }
});

defProp('boat', 'Rowboat', 'nature', { size: 2.4, h: 0.5 }, (ctx, u) => {
  const w = u * 0.9, h = u * 2.2;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.quadraticCurveTo(w / 2, -h * 0.1, w * 0.35, h / 2);
  ctx.lineTo(-w * 0.35, h / 2);
  ctx.quadraticCurveTo(-w / 2, -h * 0.1, 0, -h / 2);
  ctx.closePath(); shp(ctx, '#6b4a2b', 'rgba(0,0,0,0.55)', u * 0.04);
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.38);
  ctx.quadraticCurveTo(w * 0.32, -h * 0.1, w * 0.22, h * 0.38);
  ctx.lineTo(-w * 0.22, h * 0.38);
  ctx.quadraticCurveTo(-w * 0.32, -h * 0.1, 0, -h * 0.38);
  ctx.closePath(); shp(ctx, '#3a2a1c', null);
  ctx.strokeStyle = '#8a6238'; ctx.lineWidth = u * 0.05;
  ctx.beginPath(); ctx.moveTo(-w * 0.25, 0); ctx.lineTo(w * 0.25, 0); ctx.stroke();
});

defProp('mast', 'Mast', 'structure', { size: 1.2, h: 3.2, blocks: true }, (ctx, u) => {
  circ(ctx, 0, 0, u * 0.28); shp(ctx, '#5a4128', 'rgba(0,0,0,0.6)', u * 0.045);
  circ(ctx, 0, 0, u * 0.16); shp(ctx, '#7d5c3a', null);
  ctx.strokeStyle = 'rgba(230,225,210,0.5)'; ctx.lineWidth = u * 0.04;
  ctx.beginPath(); ctx.moveTo(0, -u * 0.55); ctx.lineTo(0, u * 0.55); ctx.stroke();
});

defProp('anchor', 'Anchor', 'dressing', { size: 0.9, h: 0.3 }, (ctx, u) => {
  ctx.strokeStyle = METAL_M; ctx.lineWidth = u * 0.06; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -u * 0.3); ctx.lineTo(0, u * 0.25); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, u * 0.12, u * 0.24, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-u * 0.15, -u * 0.18); ctx.lineTo(u * 0.15, -u * 0.18); ctx.stroke();
});

defProp('crates_stack', 'Crate Stack', 'dressing', { size: 1.4, h: 1.1 }, (ctx, u, rnd) => {
  for (let i = 0; i < 3; i++) {
    const s = u * (0.45 + rnd(i) * 0.2);
    ctx.save();
    ctx.translate((rnd(i + 3) - 0.5) * u * 0.5, (rnd(i + 6) - 0.5) * u * 0.5);
    ctx.rotate((rnd(i + 9) - 0.5) * 0.6);
    rectPath(ctx, -s / 2, -s / 2, s, s, u * 0.02); shp(ctx, i % 2 ? WOOD_L : WOOD_M, OUTLINE, u * 0.03);
    ctx.beginPath(); ctx.moveTo(-s / 2, -s / 2); ctx.lineTo(s / 2, s / 2);
    shp(ctx, null, 'rgba(0,0,0,0.3)', u * 0.025);
    ctx.restore();
  }
});

defProp('market_stall', 'Market Stall', 'structure', { size: 2.2, h: 1.7 }, (ctx, u) => {
  const w = u * 2.1, h = u * 1.3;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.04); shp(ctx, '#8a3f3f', 'rgba(0,0,0,0.5)', u * 0.04);
  ctx.fillStyle = '#e2dbc8';
  for (let i = 0; i < 5; i++) rectPath(ctx, -w / 2 + (w * (i * 2 + 1)) / 10, -h / 2, w / 10, h, 0), ctx.fill();
  rectPath(ctx, -w / 2, h * 0.28, w, h * 0.22, u * 0.02); shp(ctx, WOOD_D, 'rgba(0,0,0,0.4)', u * 0.03);
});

defProp('tent', 'Tent', 'structure', { size: 2.2, h: 1.5, blocks: true }, (ctx, u) => {
  const w = u * 2, h = u * 1.7;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath();
  shp(ctx, '#8a7a56', 'rgba(0,0,0,0.5)', u * 0.045);
  ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(0, h / 2);
  shp(ctx, null, 'rgba(0,0,0,0.3)', u * 0.035);
  ctx.beginPath();
  ctx.moveTo(-u * 0.18, h / 2); ctx.lineTo(0, h * 0.08); ctx.lineTo(u * 0.18, h / 2); ctx.closePath();
  shp(ctx, '#2b2620', null);
});

/* Markers that never rotate */
defProp('marker_a', 'Marker A', 'marker', { size: 0.8, h: 0, rand: false }, (ctx, u) => {
  circ(ctx, 0, 0, u * 0.28); shp(ctx, 'rgba(220,60,60,0.85)', '#fff', u * 0.04);
});
defProp('marker_num', 'Numbered Point', 'marker', { size: 0.8, h: 0, rand: false }, (ctx, u) => {
  circ(ctx, 0, 0, u * 0.26); shp(ctx, 'rgba(30,30,40,0.8)', '#e8c56a', u * 0.04);
  circ(ctx, 0, 0, u * 0.1); shp(ctx, '#e8c56a', null);
});

const PROP_CATEGORIES = ['furniture', 'dressing', 'structure', 'light', 'nature', 'marker'];
