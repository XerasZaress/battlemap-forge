/* Battlemap Forge — fantasy prop library.
   Grand statuary, arcane apparatus, hanging lights, ornate floor coverings and
   vehicles. Same contract as props.js: draw into a context already translated,
   rotated and scaled, with `u` = pixels per grid square. */
'use strict';

/* ---------- palette ---------- */

const GOLD_D = '#8a6a12', GOLD = '#c9a227', GOLD_L = '#f2dc86';
const MARBLE_D = '#847e74', MARBLE = '#b5afa3', MARBLE_L = '#e2dcd0';
const ARCANE = '#7fd8ff', ARCANE_D = '#2f6f92', ARCANE_L = '#d6f4ff';
const VELVET_D = '#5c1d24', VELVET = '#8c2f33', VELVET_L = '#b4494a';
const BRASS_D = '#7a5c1e', BRASS = '#b08d33', BRASS_L = '#dcc069';

/* ---------- helpers ---------- */

function poly(ctx, pts, close) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]); else ctx.lineTo(pts[i][0], pts[i][1]);
  }
  if (close !== false) ctx.closePath();
}

function starPath(ctx, r, n, innerRatio, rot) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + (rot || 0);
    const rr = i % 2 === 0 ? r : r * innerRatio;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Evenly spaced tick marks around a circle — reads as runes at map scale. */
function runeRing(ctx, r, n, col, lw, len, rot) {
  ctx.strokeStyle = col;
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rot || 0);
    const c = Math.cos(a), s = Math.sin(a);
    ctx.moveTo(c * r, s * r);
    ctx.lineTo(c * (r + len), s * (r + len));
  }
  ctx.stroke();
}

function ringsOfCandles(ctx, u, r, n, rot) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rot || 0);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    circ(ctx, x, y, u * 0.045); shp(ctx, '#efe6cd', 'rgba(0,0,0,0.35)', u * 0.012);
    circ(ctx, x, y, u * 0.022); shp(ctx, '#ffd76b', null);
  }
}

/** Soft radial bloom, for anything that glows. */
function glow(ctx, r, col, alpha) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, rgba(hexToRgb(col), alpha));
  g.addColorStop(1, rgba(hexToRgb(col), 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
}

function pedestal(ctx, u, r) {
  circ(ctx, 0, 0, r); shp(ctx, MARBLE_D, 'rgba(0,0,0,0.55)', u * 0.04);
  circ(ctx, 0, 0, r * 0.82); shp(ctx, MARBLE, 'rgba(0,0,0,0.25)', u * 0.02);
  circ(ctx, -r * 0.22, -r * 0.22, r * 0.3); shp(ctx, 'rgba(255,255,255,0.10)', null);
}

/* ================= GRAND — statuary and architecture ================= */

defProp('statue_angel', 'Angel Statue', 'grand', { size: 1.5, blocks: true, snap: true }, (ctx, u) => {
  pedestal(ctx, u, u * 0.62);
  // wings sweeping back
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * u * 0.06, -u * 0.04);
    ctx.quadraticCurveTo(s * u * 0.46, -u * 0.34, s * u * 0.5, u * 0.12);
    ctx.quadraticCurveTo(s * u * 0.34, u * 0.02, s * u * 0.08, u * 0.12);
    ctx.closePath();
    shp(ctx, MARBLE_L, 'rgba(0,0,0,0.32)', u * 0.02);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = u * 0.015;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      ctx.moveTo(s * u * 0.1, -u * 0.02 + i * u * 0.04);
      ctx.lineTo(s * u * (0.2 + i * 0.09), u * (0.02 + i * 0.02));
    }
    ctx.stroke();
  }
  // robed figure
  poly(ctx, [[-u * 0.11, u * 0.26], [-u * 0.07, -u * 0.06], [u * 0.07, -u * 0.06], [u * 0.11, u * 0.26]]);
  shp(ctx, MARBLE, 'rgba(0,0,0,0.35)', u * 0.02);
  circ(ctx, 0, -u * 0.13, u * 0.085); shp(ctx, MARBLE_L, 'rgba(0,0,0,0.3)', u * 0.018);
  circ(ctx, 0, -u * 0.13, u * 0.12); shp(ctx, null, GOLD_L, u * 0.018);
});

defProp('statue_dragon', 'Dragon Statue', 'grand', { size: 2, blocks: true, snap: true }, (ctx, u, rnd) => {
  circ(ctx, 0, 0, u * 0.85); shp(ctx, MARBLE_D, 'rgba(0,0,0,0.5)', u * 0.045);
  circ(ctx, 0, 0, u * 0.72); shp(ctx, MARBLE, null);
  // coiled body
  ctx.strokeStyle = '#6f6558'; ctx.lineWidth = u * 0.17; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 0, u * 0.4, 0.4, Math.PI * 1.7); ctx.stroke();
  ctx.strokeStyle = '#8a7f6e'; ctx.lineWidth = u * 0.1;
  ctx.beginPath(); ctx.arc(0, 0, u * 0.4, 0.4, Math.PI * 1.7); ctx.stroke();
  // wings
  for (const s of [-1, 1]) {
    poly(ctx, [[0, -u * 0.1], [s * u * 0.52, -u * 0.46], [s * u * 0.34, -u * 0.02]]);
    shp(ctx, '#7d7263', 'rgba(0,0,0,0.4)', u * 0.02);
  }
  // head and tail
  poly(ctx, [[u * 0.3, u * 0.3], [u * 0.56, u * 0.16], [u * 0.44, u * 0.42]]);
  shp(ctx, '#8a7f6e', 'rgba(0,0,0,0.4)', u * 0.02);
  ctx.strokeStyle = '#6f6558'; ctx.lineWidth = u * 0.05;
  ctx.beginPath();
  ctx.moveTo(-u * 0.36, u * 0.2);
  ctx.quadraticCurveTo(-u * 0.6, u * 0.42, -u * 0.3, u * 0.58);
  ctx.stroke();
});

defProp('statue_warrior', 'Warrior Statue', 'grand', { size: 1.3, blocks: true, snap: true }, (ctx, u) => {
  pedestal(ctx, u, u * 0.55);
  poly(ctx, [[-u * 0.13, u * 0.24], [-u * 0.1, -u * 0.05], [u * 0.1, -u * 0.05], [u * 0.13, u * 0.24]]);
  shp(ctx, MARBLE, 'rgba(0,0,0,0.35)', u * 0.022);
  circ(ctx, 0, -u * 0.14, u * 0.085); shp(ctx, MARBLE_L, 'rgba(0,0,0,0.3)', u * 0.018);
  // sword down the centre, shield at the side
  ctx.strokeStyle = METAL_L; ctx.lineWidth = u * 0.035;
  ctx.beginPath(); ctx.moveTo(u * 0.16, -u * 0.1); ctx.lineTo(u * 0.16, u * 0.3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(u * 0.09, -u * 0.06); ctx.lineTo(u * 0.23, -u * 0.06); ctx.stroke();
  circ(ctx, -u * 0.19, u * 0.05, u * 0.12); shp(ctx, '#6a6f7a', GOLD_D, u * 0.02);
});

defProp('statue_bust', 'Bust on Plinth', 'grand', { size: 0.9, snap: true }, (ctx, u) => {
  rectPath(ctx, -u * 0.3, -u * 0.3, u * 0.6, u * 0.6, u * 0.04);
  shp(ctx, MARBLE_D, 'rgba(0,0,0,0.5)', u * 0.035);
  rectPath(ctx, -u * 0.24, -u * 0.24, u * 0.48, u * 0.48, u * 0.03);
  shp(ctx, MARBLE, null);
  circ(ctx, 0, 0, u * 0.14); shp(ctx, MARBLE_L, 'rgba(0,0,0,0.3)', u * 0.02);
  circ(ctx, -u * 0.04, -u * 0.04, u * 0.05); shp(ctx, 'rgba(255,255,255,0.2)', null);
});

defProp('gargoyle', 'Gargoyle', 'grand', { size: 1, blocks: true, snap: true }, (ctx, u) => {
  circ(ctx, 0, 0, u * 0.36); shp(ctx, '#54504a', 'rgba(0,0,0,0.5)', u * 0.035);
  for (const s of [-1, 1]) {
    poly(ctx, [[s * u * 0.05, -u * 0.05], [s * u * 0.4, -u * 0.3], [s * u * 0.3, u * 0.05]]);
    shp(ctx, '#6b665e', 'rgba(0,0,0,0.4)', u * 0.02);
  }
  circ(ctx, 0, u * 0.02, u * 0.15); shp(ctx, '#7a746b', 'rgba(0,0,0,0.4)', u * 0.02);
  circ(ctx, -u * 0.05, 0, u * 0.028); shp(ctx, '#d05a3a', null);
  circ(ctx, u * 0.05, 0, u * 0.028); shp(ctx, '#d05a3a', null);
});

defProp('obelisk', 'Obelisk', 'grand', { size: 1.2, blocks: true, snap: true }, (ctx, u) => {
  rectPath(ctx, -u * 0.34, -u * 0.34, u * 0.68, u * 0.68, u * 0.03);
  shp(ctx, MARBLE_D, 'rgba(0,0,0,0.55)', u * 0.04);
  poly(ctx, [[-u * 0.2, -u * 0.2], [u * 0.2, -u * 0.2], [u * 0.13, u * 0.2], [-u * 0.13, u * 0.2]]);
  shp(ctx, '#6e6a60', 'rgba(0,0,0,0.4)', u * 0.025);
  poly(ctx, [[-u * 0.13, -u * 0.13], [u * 0.13, -u * 0.13], [u * 0.08, u * 0.13], [-u * 0.08, u * 0.13]]);
  shp(ctx, '#8b8578', null);
  ctx.strokeStyle = rgba(hexToRgb(ARCANE), 0.55); ctx.lineWidth = u * 0.02;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const y = -u * 0.08 + i * u * 0.08;
    ctx.moveTo(-u * 0.05, y); ctx.lineTo(u * 0.05, y);
  }
  ctx.stroke();
});

defProp('column_ornate', 'Fluted Column', 'grand', { size: 1.15, blocks: true, snap: true }, (ctx, u) => {
  rectPath(ctx, -u * 0.44, -u * 0.44, u * 0.88, u * 0.88, u * 0.04);
  shp(ctx, MARBLE_D, 'rgba(0,0,0,0.55)', u * 0.04);
  circ(ctx, 0, 0, u * 0.34); shp(ctx, MARBLE, 'rgba(0,0,0,0.35)', u * 0.025);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = u * 0.02;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.moveTo(Math.cos(a) * u * 0.14, Math.sin(a) * u * 0.14);
    ctx.lineTo(Math.cos(a) * u * 0.32, Math.sin(a) * u * 0.32);
  }
  ctx.stroke();
  circ(ctx, 0, 0, u * 0.13); shp(ctx, MARBLE_L, 'rgba(0,0,0,0.25)', u * 0.018);
});

defProp('fountain_grand', 'Grand Fountain', 'grand', { size: 2.8, blocks: true, snap: true }, (ctx, u) => {
  circ(ctx, 0, 0, u * 1.3); shp(ctx, MARBLE_D, 'rgba(0,0,0,0.5)', u * 0.06);
  circ(ctx, 0, 0, u * 1.14); shp(ctx, '#2f6f8a', 'rgba(0,0,0,0.3)', u * 0.03);
  circ(ctx, 0, 0, u * 0.62); shp(ctx, MARBLE, 'rgba(0,0,0,0.35)', u * 0.035);
  circ(ctx, 0, 0, u * 0.5); shp(ctx, '#3a86a3', null);
  circ(ctx, 0, 0, u * 0.24); shp(ctx, MARBLE_L, 'rgba(0,0,0,0.3)', u * 0.025);
  circ(ctx, 0, 0, u * 0.1); shp(ctx, GOLD, GOLD_D, u * 0.02);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    circ(ctx, Math.cos(a) * u * 0.36, Math.sin(a) * u * 0.36, u * 0.05); ctx.fill();
  }
  circ(ctx, -u * 0.4, -u * 0.4, u * 0.26); shp(ctx, 'rgba(255,255,255,0.12)', null);
});

defProp('throne_grand', 'Grand Throne', 'grand', { size: 1.7, snap: true }, (ctx, u) => {
  const w = u * 0.95, h = u * 1.05;
  poly(ctx, [[-w / 2, -h * 0.62], [w / 2, -h * 0.62], [w / 2 * 0.86, h / 2], [-w / 2 * 0.86, h / 2]]);
  shp(ctx, '#5e594f', 'rgba(0,0,0,0.6)', u * 0.045);
  rectPath(ctx, -w * 0.34, -h * 0.42, w * 0.68, h * 0.78, u * 0.04);
  shp(ctx, VELVET, 'rgba(0,0,0,0.35)', u * 0.025);
  rectPath(ctx, -w * 0.26, -h * 0.34, w * 0.52, h * 0.3, u * 0.03);
  shp(ctx, VELVET_L, null);
  // gilded crest
  starPath(ctx, u * 0.14, 5, 0.45, -Math.PI / 2);
  ctx.translate(0, -h * 0.5); shp(ctx, GOLD, GOLD_D, u * 0.02); ctx.translate(0, h * 0.5);
  ctx.strokeStyle = GOLD; ctx.lineWidth = u * 0.025;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + u * 0.05, -h * 0.6); ctx.lineTo(-w / 2 + u * 0.05, h * 0.44);
  ctx.moveTo(w / 2 - u * 0.05, -h * 0.6); ctx.lineTo(w / 2 - u * 0.05, h * 0.44);
  ctx.stroke();
});

defProp('dais', 'Raised Dais', 'grand', { size: 3.4, under: true, snap: true }, (ctx, u) => {
  const w = u * 3.2, h = u * 2.4;
  // three concentric steps, each catching light on one edge and casting on the next
  const tones = [[MARBLE_D, 0.55], [MARBLE, 0.4], [MARBLE_L, 0.3]];
  for (let i = 0; i < 3; i++) {
    const inset = u * 0.26 * i;
    const [fill, sh] = tones[i];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,' + sh + ')';
    ctx.shadowBlur = u * 0.16;
    ctx.shadowOffsetY = u * 0.07;
    rectPath(ctx, -w / 2 + inset, -h / 2 + inset, w - inset * 2, h - inset * 2, u * 0.05);
    shp(ctx, fill, null);
    ctx.restore();
    rectPath(ctx, -w / 2 + inset, -h / 2 + inset, w - inset * 2, h - inset * 2, u * 0.05);
    shp(ctx, null, 'rgba(0,0,0,0.35)', u * 0.022);
    // lit top edge of each riser
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = u * 0.03;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + inset + u * 0.06, -h / 2 + inset + u * 0.03);
    ctx.lineTo(w / 2 - inset - u * 0.06, -h / 2 + inset + u * 0.03);
    ctx.stroke();
  }
  // inlaid border on the top platform
  const t = u * 0.52;
  rectPath(ctx, -w / 2 + t + u * 0.12, -h / 2 + t + u * 0.12, w - (t + u * 0.12) * 2, h - (t + u * 0.12) * 2, u * 0.03);
  shp(ctx, null, rgba(hexToRgb(GOLD), 0.6), u * 0.025);
});

defProp('altar_grand', 'High Altar', 'grand', { size: 2.2, snap: true }, (ctx, u) => {
  const w = u * 1.9, h = u * 1.0;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.05);
  shp(ctx, MARBLE_D, 'rgba(0,0,0,0.6)', u * 0.05);
  rectPath(ctx, -w / 2 + u * 0.08, -h / 2 + u * 0.08, w - u * 0.16, h - u * 0.16, u * 0.04);
  shp(ctx, MARBLE, 'rgba(0,0,0,0.3)', u * 0.025);
  rectPath(ctx, -w / 2 + u * 0.16, -h * 0.14, w - u * 0.32, h * 0.4, u * 0.03);
  shp(ctx, VELVET, GOLD_D, u * 0.022);
  circ(ctx, 0, -h * 0.16, u * 0.14); shp(ctx, GOLD, GOLD_D, u * 0.022);
  circ(ctx, 0, -h * 0.16, u * 0.06); shp(ctx, GOLD_L, null);
  for (const sx of [-1, 1]) {
    circ(ctx, sx * w * 0.36, -h * 0.16, u * 0.05); shp(ctx, '#efe6cd', 'rgba(0,0,0,0.3)', u * 0.014);
    circ(ctx, sx * w * 0.36, -h * 0.16, u * 0.022); shp(ctx, '#ffd76b', null);
  }
});

defProp('menhir', 'Standing Stone', 'grand', { size: 1.1, blocks: true }, (ctx, u, rnd) => {
  blob(ctx, u * 0.36, 8, 0.32, rnd);
  shp(ctx, '#6a6459', 'rgba(0,0,0,0.55)', u * 0.045);
  blob(ctx, u * 0.2, 7, 0.35, seededFn(9));
  shp(ctx, '#837c6e', null);
  ctx.strokeStyle = rgba(hexToRgb(ARCANE), 0.4); ctx.lineWidth = u * 0.022;
  ctx.beginPath();
  ctx.moveTo(-u * 0.06, -u * 0.1); ctx.lineTo(u * 0.06, 0); ctx.lineTo(-u * 0.06, u * 0.1);
  ctx.stroke();
});

defProp('great_bell', 'Great Bell', 'grand', { size: 1.4, blocks: true, snap: true }, (ctx, u) => {
  circ(ctx, 0, 0, u * 0.56); shp(ctx, BRASS_D, 'rgba(0,0,0,0.55)', u * 0.045);
  circ(ctx, 0, 0, u * 0.46); shp(ctx, BRASS, 'rgba(0,0,0,0.25)', u * 0.02);
  circ(ctx, 0, 0, u * 0.3); shp(ctx, BRASS_L, 'rgba(0,0,0,0.2)', u * 0.018);
  circ(ctx, 0, 0, u * 0.1); shp(ctx, '#3c3c3c', null);
  circ(ctx, -u * 0.16, -u * 0.16, u * 0.12); shp(ctx, 'rgba(255,255,255,0.16)', null);
});

defProp('tapestry', 'Tapestry', 'grand', { size: 1.6, under: true, snap: true }, (ctx, u) => {
  const w = u * 1.0, h = u * 1.5;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.02);
  shp(ctx, VELVET_D, GOLD_D, u * 0.03);
  rectPath(ctx, -w / 2 + u * 0.07, -h / 2 + u * 0.07, w - u * 0.14, h - u * 0.14, 0);
  shp(ctx, VELVET, GOLD, u * 0.02);
  starPath(ctx, u * 0.2, 6, 0.45, 0);
  shp(ctx, GOLD_L, GOLD_D, u * 0.018);
  ctx.fillStyle = GOLD_D;
  for (let i = 0; i < 5; i++) ctx.fillRect(-w / 2 + u * 0.1 + i * u * 0.19, h / 2 - u * 0.04, u * 0.05, u * 0.08);
});

/* ================= ARCANE ================= */

defProp('magic_circle', 'Magic Circle', 'arcane',
  { size: 3, under: true, snap: true, light: { range: 3, color: '#7fd8ff', intensity: 0.45 } }, (ctx, u) => {
    glow(ctx, u * 1.5, ARCANE, 0.16);
    ctx.strokeStyle = rgba(hexToRgb(ARCANE), 0.85); ctx.lineWidth = u * 0.035;
    circ(ctx, 0, 0, u * 1.32); ctx.stroke();
    circ(ctx, 0, 0, u * 1.18); ctx.stroke();
    circ(ctx, 0, 0, u * 0.72); ctx.stroke();
    circ(ctx, 0, 0, u * 0.3); ctx.stroke();
    runeRing(ctx, u * 1.18, 24, rgba(hexToRgb(ARCANE_L), 0.8), u * 0.03, u * 0.14);
    starPath(ctx, u * 0.72, 6, 0.58, -Math.PI / 2);
    ctx.strokeStyle = rgba(hexToRgb(ARCANE_L), 0.75); ctx.lineWidth = u * 0.03; ctx.stroke();
    circ(ctx, 0, 0, u * 0.12); shp(ctx, rgba(hexToRgb(ARCANE_L), 0.7), null);
  });

defProp('summoning_circle', 'Summoning Circle', 'arcane',
  { size: 2.8, under: true, snap: true, light: { range: 2.5, color: '#ff5a4a', intensity: 0.4 } }, (ctx, u) => {
    glow(ctx, u * 1.4, '#ff5a4a', 0.18);
    const red = 'rgba(220,70,55,0.9)';
    ctx.strokeStyle = red; ctx.lineWidth = u * 0.04;
    circ(ctx, 0, 0, u * 1.22); ctx.stroke();
    circ(ctx, 0, 0, u * 1.06); ctx.stroke();
    starPath(ctx, u * 1.02, 5, 0.48, -Math.PI / 2);
    ctx.strokeStyle = 'rgba(255,120,90,0.95)'; ctx.lineWidth = u * 0.045; ctx.stroke();
    runeRing(ctx, u * 1.06, 16, 'rgba(255,150,120,0.7)', u * 0.028, u * 0.12);
    circ(ctx, 0, 0, u * 0.16); shp(ctx, 'rgba(255,140,110,0.6)', null);
  });

defProp('scrying_pool', 'Scrying Pool', 'arcane',
  { size: 2.2, under: true, snap: true, light: { range: 2.5, color: '#7fd8ff', intensity: 0.4 } }, (ctx, u) => {
    circ(ctx, 0, 0, u * 1.05); shp(ctx, MARBLE_D, 'rgba(0,0,0,0.5)', u * 0.05);
    circ(ctx, 0, 0, u * 0.88); shp(ctx, '#123a4a', 'rgba(0,0,0,0.3)', u * 0.025);
    glow(ctx, u * 0.8, ARCANE, 0.3);
    ctx.strokeStyle = rgba(hexToRgb(ARCANE), 0.45); ctx.lineWidth = u * 0.025;
    for (let i = 1; i <= 3; i++) { circ(ctx, 0, 0, u * 0.2 * i); ctx.stroke(); }
    circ(ctx, -u * 0.26, -u * 0.26, u * 0.18); shp(ctx, 'rgba(255,255,255,0.16)', null);
  });

defProp('portal_arch', 'Portal Arch', 'arcane',
  { size: 2, blocks: true, snap: true, light: { range: 4, color: '#a06fe8', intensity: 0.7 } }, (ctx, u) => {
    const w = u * 1.5, h = u * 0.5;
    rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.06);
    shp(ctx, MARBLE_D, 'rgba(0,0,0,0.6)', u * 0.05);
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.4, h * 0.32, 0, 0, Math.PI * 2); ctx.clip();
    glow(ctx, w * 0.5, '#a06fe8', 0.85);
    ctx.strokeStyle = 'rgba(220,190,255,0.6)'; ctx.lineWidth = u * 0.02;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.11 * i, h * 0.09 * i, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.4, h * 0.32, 0, 0, Math.PI * 2);
    shp(ctx, null, GOLD, u * 0.025);
  });

defProp('crystal_ball', 'Crystal Ball', 'arcane',
  { size: 0.8, light: { range: 2.5, color: '#7fd8ff', intensity: 0.5 } }, (ctx, u) => {
    circ(ctx, 0, 0, u * 0.26); shp(ctx, BRASS_D, 'rgba(0,0,0,0.5)', u * 0.03);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      poly(ctx, [[Math.cos(a) * u * 0.24, Math.sin(a) * u * 0.24],
      [Math.cos(a + 0.5) * u * 0.28, Math.sin(a + 0.5) * u * 0.28], [0, 0]]);
      shp(ctx, BRASS, null);
    }
    circ(ctx, 0, 0, u * 0.19); shp(ctx, 'rgba(150,220,245,0.85)', 'rgba(255,255,255,0.5)', u * 0.02);
    circ(ctx, -u * 0.06, -u * 0.06, u * 0.06); shp(ctx, 'rgba(255,255,255,0.55)', null);
  });

defProp('orrery', 'Orrery', 'arcane', { size: 1.7, snap: true }, (ctx, u) => {
  circ(ctx, 0, 0, u * 0.68); shp(ctx, WOOD_D, 'rgba(0,0,0,0.5)', u * 0.04);
  circ(ctx, 0, 0, u * 0.6); shp(ctx, WOOD_M, null);
  ctx.strokeStyle = BRASS; ctx.lineWidth = u * 0.03;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(0, 0, u * 0.16 * i, u * 0.16 * i * 0.72, i * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  circ(ctx, 0, 0, u * 0.09); shp(ctx, GOLD_L, GOLD_D, u * 0.02);
  const pl = [[0.16, 0.4], [0.32, 2.1], [0.48, 3.6]];
  for (const [r, a] of pl) {
    circ(ctx, Math.cos(a) * u * r, Math.sin(a) * u * r * 0.72, u * 0.045);
    shp(ctx, BRASS_L, 'rgba(0,0,0,0.35)', u * 0.014);
  }
});

defProp('lectern', 'Lectern', 'arcane', { size: 0.9, snap: true }, (ctx, u) => {
  poly(ctx, [[-u * 0.26, -u * 0.16], [u * 0.26, -u * 0.16], [u * 0.3, u * 0.2], [-u * 0.3, u * 0.2]]);
  shp(ctx, WOOD_D, 'rgba(0,0,0,0.5)', u * 0.035);
  rectPath(ctx, -u * 0.22, -u * 0.12, u * 0.44, u * 0.26, u * 0.02);
  shp(ctx, '#e8e0c8', 'rgba(0,0,0,0.35)', u * 0.02);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = u * 0.018;
  ctx.beginPath(); ctx.moveTo(0, -u * 0.12); ctx.lineTo(0, u * 0.14); ctx.stroke();
  ctx.strokeStyle = 'rgba(60,60,70,0.5)'; ctx.lineWidth = u * 0.012;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const y = -u * 0.05 + i * u * 0.05;
    ctx.moveTo(-u * 0.17, y); ctx.lineTo(-u * 0.04, y);
    ctx.moveTo(u * 0.04, y); ctx.lineTo(u * 0.17, y);
  }
  ctx.stroke();
});

defProp('alchemy_bench', 'Alchemy Bench', 'arcane', { size: 2.2, snap: true }, (ctx, u) => {
  const w = u * 2.0, h = u * 0.85;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.05);
  shp(ctx, WOOD_D, OUTLINE, u * 0.04);
  rectPath(ctx, -w / 2 + u * 0.06, -h / 2 + u * 0.06, w - u * 0.12, h - u * 0.12, u * 0.04);
  shp(ctx, WOOD_M, null);
  grain(ctx, -w / 2 + u * 0.06, -h / 2 + u * 0.06, w - u * 0.12, h - u * 0.12, 6, 'rgba(0,0,0,0.18)', true);
  const cols = ['#6fe3c0', '#e37f9f', '#7fb8ff', '#e3d06f'];
  for (let i = 0; i < 4; i++) {
    const x = -w * 0.33 + i * w * 0.22;
    circ(ctx, x, -h * 0.08, u * 0.09); shp(ctx, 'rgba(220,235,240,0.85)', 'rgba(0,0,0,0.35)', u * 0.016);
    circ(ctx, x, -h * 0.06, u * 0.055); shp(ctx, cols[i], null);
  }
  circ(ctx, w * 0.36, h * 0.12, u * 0.13); shp(ctx, '#2e3238', 'rgba(0,0,0,0.5)', u * 0.025);
  circ(ctx, w * 0.36, h * 0.12, u * 0.08); shp(ctx, '#4a7a4f', null);
});

defProp('rune_stone', 'Rune Stone', 'arcane',
  { size: 0.9, blocks: true, light: { range: 2, color: '#7fd8ff', intensity: 0.4 } }, (ctx, u, rnd) => {
    blob(ctx, u * 0.3, 8, 0.3, rnd);
    shp(ctx, '#5b564d', 'rgba(0,0,0,0.55)', u * 0.04);
    ctx.strokeStyle = rgba(hexToRgb(ARCANE), 0.85); ctx.lineWidth = u * 0.03;
    ctx.beginPath();
    ctx.moveTo(-u * 0.08, -u * 0.12); ctx.lineTo(u * 0.06, -u * 0.02);
    ctx.lineTo(-u * 0.06, u * 0.04); ctx.lineTo(u * 0.08, u * 0.13);
    ctx.stroke();
  });

defProp('arcane_pylon', 'Arcane Pylon', 'arcane',
  { size: 1.1, blocks: true, snap: true, light: { range: 4.5, color: '#a06fe8', intensity: 0.8 } }, (ctx, u) => {
    rectPath(ctx, -u * 0.32, -u * 0.32, u * 0.64, u * 0.64, u * 0.05);
    shp(ctx, MARBLE_D, 'rgba(0,0,0,0.55)', u * 0.04);
    circ(ctx, 0, 0, u * 0.22); shp(ctx, MARBLE, 'rgba(0,0,0,0.3)', u * 0.02);
    glow(ctx, u * 0.34, '#a06fe8', 0.6);
    starPath(ctx, u * 0.17, 4, 0.4, Math.PI / 4);
    shp(ctx, 'rgba(190,150,240,0.95)', 'rgba(240,225,255,0.8)', u * 0.02);
  });

defProp('mirror_tall', 'Standing Mirror', 'arcane', { size: 0.9, snap: true }, (ctx, u) => {
  ctx.beginPath(); ctx.ellipse(0, 0, u * 0.22, u * 0.34, 0, 0, Math.PI * 2);
  shp(ctx, GOLD_D, 'rgba(0,0,0,0.5)', u * 0.035);
  ctx.beginPath(); ctx.ellipse(0, 0, u * 0.17, u * 0.29, 0, 0, Math.PI * 2);
  shp(ctx, '#9fb6c4', 'rgba(255,255,255,0.35)', u * 0.02);
  ctx.beginPath(); ctx.moveTo(-u * 0.1, u * 0.16); ctx.lineTo(u * 0.06, -u * 0.2);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = u * 0.04; ctx.stroke();
});

defProp('spell_tome', 'Open Tome', 'arcane',
  { size: 0.7, light: { range: 1.6, color: '#7fd8ff', intensity: 0.3 } }, (ctx, u) => {
    rectPath(ctx, -u * 0.24, -u * 0.16, u * 0.48, u * 0.32, u * 0.02);
    shp(ctx, '#4a2f22', 'rgba(0,0,0,0.5)', u * 0.025);
    rectPath(ctx, -u * 0.21, -u * 0.13, u * 0.2, u * 0.26, u * 0.01); shp(ctx, '#e8e0c8', null);
    rectPath(ctx, u * 0.01, -u * 0.13, u * 0.2, u * 0.26, u * 0.01); shp(ctx, '#ded5bc', null);
    glow(ctx, u * 0.2, ARCANE, 0.35);
  });

/* ================= LIGHT — hanging and ornate ================= */

defProp('chandelier', 'Chandelier', 'light',
  { size: 1.7, light: { range: 6, color: '#ffd08a', intensity: 1 } }, (ctx, u) => {
    glow(ctx, u * 0.85, '#ffd08a', 0.22);
    ctx.strokeStyle = BRASS_D; ctx.lineWidth = u * 0.03;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * u * 0.6, Math.sin(a) * u * 0.6); ctx.stroke();
    }
    circ(ctx, 0, 0, u * 0.58); shp(ctx, null, BRASS, u * 0.06);
    circ(ctx, 0, 0, u * 0.58); shp(ctx, null, BRASS_L, u * 0.025);
    ringsOfCandles(ctx, u, u * 0.58, 8, 0);
    circ(ctx, 0, 0, u * 0.1); shp(ctx, BRASS_D, BRASS_L, u * 0.02);
  });

defProp('chandelier_grand', 'Grand Chandelier', 'light',
  { size: 2.6, light: { range: 8, color: '#ffd8a0', intensity: 1 } }, (ctx, u) => {
    glow(ctx, u * 1.3, '#ffd8a0', 0.24);
    ctx.strokeStyle = GOLD_D; ctx.lineWidth = u * 0.035;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * u * 1.0, Math.sin(a) * u * 1.0); ctx.stroke();
    }
    circ(ctx, 0, 0, u * 1.0); shp(ctx, null, GOLD, u * 0.07);
    circ(ctx, 0, 0, u * 1.0); shp(ctx, null, GOLD_L, u * 0.028);
    circ(ctx, 0, 0, u * 0.6); shp(ctx, null, GOLD, u * 0.055);
    ringsOfCandles(ctx, u, u * 1.0, 12, 0);
    ringsOfCandles(ctx, u, u * 0.6, 8, 0.3);
    // hanging crystals
    ctx.fillStyle = 'rgba(220,240,255,0.6)';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.26;
      poly(ctx, [[Math.cos(a) * u * 0.8, Math.sin(a) * u * 0.8 - u * 0.05],
      [Math.cos(a) * u * 0.86, Math.sin(a) * u * 0.86],
      [Math.cos(a) * u * 0.8, Math.sin(a) * u * 0.8 + u * 0.05]]);
      ctx.fill();
    }
    circ(ctx, 0, 0, u * 0.14); shp(ctx, GOLD_D, GOLD_L, u * 0.022);
  });

defProp('candelabra', 'Candelabra', 'light',
  { size: 0.9, light: { range: 3.5, color: '#ffe0a0', intensity: 0.7 } }, (ctx, u) => {
    ctx.strokeStyle = BRASS_D; ctx.lineWidth = u * 0.035;
    ctx.beginPath();
    ctx.moveTo(-u * 0.26, -u * 0.04); ctx.quadraticCurveTo(0, -u * 0.2, u * 0.26, -u * 0.04);
    ctx.stroke();
    circ(ctx, 0, u * 0.08, u * 0.15); shp(ctx, BRASS, 'rgba(0,0,0,0.45)', u * 0.025);
    for (const x of [-0.26, -0.13, 0, 0.13, 0.26]) {
      circ(ctx, u * x, u * (x === 0 ? -0.12 : -0.04), u * 0.045);
      shp(ctx, '#efe6cd', 'rgba(0,0,0,0.35)', u * 0.014);
      circ(ctx, u * x, u * (x === 0 ? -0.12 : -0.04), u * 0.022); shp(ctx, '#ffd76b', null);
    }
  });

defProp('wall_sconce', 'Wall Sconce', 'light',
  { size: 0.55, snap: true, light: { range: 3, color: '#ff9d4c', intensity: 0.6 } }, (ctx, u) => {
    poly(ctx, [[-u * 0.14, u * 0.18], [u * 0.14, u * 0.18], [u * 0.08, u * 0.02], [-u * 0.08, u * 0.02]]);
    shp(ctx, BRASS_D, 'rgba(0,0,0,0.5)', u * 0.025);
    circ(ctx, 0, -u * 0.04, u * 0.1); shp(ctx, BRASS, 'rgba(0,0,0,0.35)', u * 0.018);
    circ(ctx, 0, -u * 0.08, u * 0.08); shp(ctx, '#ff8a2b', null);
    circ(ctx, 0, -u * 0.09, u * 0.04); shp(ctx, '#ffe8a8', null);
  });

defProp('hanging_lantern', 'Hanging Lantern', 'light',
  { size: 0.8, light: { range: 4, color: '#ffcf8a', intensity: 0.75 } }, (ctx, u) => {
    glow(ctx, u * 0.4, '#ffcf8a', 0.2);
    ctx.strokeStyle = METAL_D; ctx.lineWidth = u * 0.022;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * u * 0.24, Math.sin(a) * u * 0.24); ctx.stroke();
    }
    circ(ctx, 0, 0, u * 0.2); shp(ctx, 'rgba(255,214,150,0.9)', METAL_D, u * 0.03);
    circ(ctx, 0, 0, u * 0.1); shp(ctx, '#fff0c0', null);
  });

defProp('brazier_grand', 'Grand Brazier', 'light',
  { size: 1.3, snap: true, light: { range: 6.5, color: '#ff9d4c', intensity: 1 } }, (ctx, u, rnd) => {
    glow(ctx, u * 0.7, '#ff9d4c', 0.25);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      ctx.strokeStyle = BRASS_D; ctx.lineWidth = u * 0.055;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * u * 0.5, Math.sin(a) * u * 0.5); ctx.stroke();
    }
    circ(ctx, 0, 0, u * 0.42); shp(ctx, BRASS_D, 'rgba(0,0,0,0.55)', u * 0.045);
    circ(ctx, 0, 0, u * 0.34); shp(ctx, BRASS, 'rgba(0,0,0,0.3)', u * 0.02);
    blob(ctx, u * 0.26, 9, 0.4, rnd); shp(ctx, '#ff7a1a', null);
    blob(ctx, u * 0.15, 8, 0.45, seededFn(5)); shp(ctx, '#ffe08a', null);
  });

defProp('fire_pit', 'Fire Pit', 'light',
  { size: 2, light: { range: 7, color: '#ff8f3c', intensity: 1 } }, (ctx, u, rnd) => {
    glow(ctx, u * 1, '#ff8f3c', 0.22);
    circ(ctx, 0, 0, u * 0.9); shp(ctx, '#5f5951', 'rgba(0,0,0,0.5)', u * 0.05);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rnd(i) * 0.2;
      circ(ctx, Math.cos(a) * u * 0.78, Math.sin(a) * u * 0.78, u * (0.09 + rnd(i + 4) * 0.05));
      shp(ctx, '#6d675d', 'rgba(0,0,0,0.45)', u * 0.02);
    }
    circ(ctx, 0, 0, u * 0.62); shp(ctx, '#2a211c', null);
    ctx.strokeStyle = WOOD_D; ctx.lineWidth = u * 0.07; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI + 0.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * u * 0.4, Math.sin(a) * u * 0.4);
      ctx.lineTo(-Math.cos(a) * u * 0.4, -Math.sin(a) * u * 0.4);
      ctx.stroke();
    }
    blob(ctx, u * 0.34, 10, 0.45, rnd); shp(ctx, '#ff7a1a', null);
    blob(ctx, u * 0.18, 8, 0.5, seededFn(3)); shp(ctx, '#ffe08a', null);
  });

defProp('will_o_wisp', 'Wisp', 'light',
  { size: 0.5, light: { range: 3, color: '#8fffd0', intensity: 0.55 } }, (ctx, u) => {
    glow(ctx, u * 0.25, '#8fffd0', 0.75);
    circ(ctx, 0, 0, u * 0.07); shp(ctx, '#e6fff6', null);
  });

/* ================= FURNITURE — rugs and grand pieces ================= */

function rugBorders(ctx, u, w, h, base, trim, inner) {
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.03);
  shp(ctx, base, 'rgba(0,0,0,0.4)', u * 0.035);
  rectPath(ctx, -w / 2 + u * 0.09, -h / 2 + u * 0.09, w - u * 0.18, h - u * 0.18, 0);
  shp(ctx, null, trim, u * 0.03);
  rectPath(ctx, -w / 2 + u * 0.2, -h / 2 + u * 0.2, w - u * 0.4, h - u * 0.4, 0);
  shp(ctx, inner, trim, u * 0.022);
}

defProp('rug_ornate', 'Ornate Rug', 'furniture', { size: 3.4, under: true, snap: true }, (ctx, u) => {
  const w = u * 3.2, h = u * 2.2;
  rugBorders(ctx, u, w, h, VELVET_D, GOLD, VELVET);
  starPath(ctx, u * 0.5, 8, 0.45, 0);
  shp(ctx, VELVET_L, GOLD_L, u * 0.025);
  circ(ctx, 0, 0, u * 0.2); shp(ctx, GOLD_D, GOLD_L, u * 0.02);
  ctx.strokeStyle = rgba(hexToRgb(GOLD), 0.7); ctx.lineWidth = u * 0.02;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * (w / 2 - u * 0.44), sy * (h / 2 - u * 0.44), u * 0.16, 0, Math.PI * 2);
    ctx.stroke();
  }
  // fringe
  ctx.strokeStyle = GOLD_L; ctx.lineWidth = u * 0.02;
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const x = -w / 2 + (w * i) / 17;
    ctx.moveTo(x, -h / 2); ctx.lineTo(x, -h / 2 - u * 0.07);
    ctx.moveTo(x, h / 2); ctx.lineTo(x, h / 2 + u * 0.07);
  }
  ctx.stroke();
});

defProp('rug_round', 'Round Rug', 'furniture', { size: 2.6, under: true, snap: true }, (ctx, u) => {
  circ(ctx, 0, 0, u * 1.22); shp(ctx, '#2f4d6b', 'rgba(0,0,0,0.4)', u * 0.035);
  circ(ctx, 0, 0, u * 1.08); shp(ctx, '#3d648a', GOLD, u * 0.028);
  circ(ctx, 0, 0, u * 0.78); shp(ctx, '#2f4d6b', GOLD_D, u * 0.022);
  starPath(ctx, u * 0.62, 12, 0.6, 0);
  shp(ctx, '#4a7aa6', rgba(hexToRgb(GOLD), 0.7), u * 0.02);
  circ(ctx, 0, 0, u * 0.26); shp(ctx, GOLD_D, GOLD_L, u * 0.022);
  circ(ctx, 0, 0, u * 0.1); shp(ctx, '#e8e0c8', null);
});

defProp('rug_runner', 'Runner', 'furniture', { size: 4, under: true, snap: true }, (ctx, u) => {
  const w = u * 3.8, h = u * 0.95;
  rugBorders(ctx, u, w, h, '#4a2440', GOLD_D, '#6b3559');
  ctx.strokeStyle = rgba(hexToRgb(GOLD), 0.75); ctx.lineWidth = u * 0.022;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const x = -w / 2 + u * 0.4 + (i * (w - u * 0.8)) / 6;
    ctx.moveTo(x, -h * 0.16); ctx.lineTo(x + u * 0.12, 0); ctx.lineTo(x, h * 0.16);
    ctx.lineTo(x - u * 0.12, 0); ctx.closePath();
  }
  ctx.stroke();
});

defProp('mosaic_floor', 'Floor Mosaic', 'furniture', { size: 3, under: true, snap: true }, (ctx, u) => {
  circ(ctx, 0, 0, u * 1.4); shp(ctx, '#8a8172', 'rgba(0,0,0,0.35)', u * 0.03);
  const cols = ['#9c6b3f', '#3f6b7a', '#8a3f3f', '#c9a227', '#5a7a4a'];
  for (let ring = 0; ring < 4; ring++) {
    const r0 = u * (0.3 + ring * 0.27), n = 8 + ring * 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.2;
      const x = Math.cos(a) * r0, y = Math.sin(a) * r0;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      rectPath(ctx, -u * 0.07, -u * 0.07, u * 0.14, u * 0.14, u * 0.02);
      shp(ctx, cols[(i + ring) % cols.length], 'rgba(0,0,0,0.25)', u * 0.012);
      ctx.restore();
    }
  }
  circ(ctx, 0, 0, u * 0.22); shp(ctx, GOLD, GOLD_D, u * 0.025);
});

defProp('banquet_table', 'Banquet Table', 'furniture', { size: 4.2, snap: true }, (ctx, u) => {
  const w = u * 4, h = u * 1.1;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.05);
  shp(ctx, WOOD_D, OUTLINE, u * 0.045);
  rectPath(ctx, -w / 2 + u * 0.07, -h / 2 + u * 0.07, w - u * 0.14, h - u * 0.14, u * 0.04);
  shp(ctx, WOOD_L, null);
  grain(ctx, -w / 2 + u * 0.07, -h / 2 + u * 0.07, w - u * 0.14, h - u * 0.14, 10, 'rgba(0,0,0,0.15)', true);
  rectPath(ctx, -w / 2 + u * 0.2, -h * 0.14, w - u * 0.4, h * 0.28, u * 0.02);
  shp(ctx, '#e2dbc8', 'rgba(0,0,0,0.15)', u * 0.015);
  for (let i = 0; i < 8; i++) {
    const x = -w / 2 + u * 0.35 + (i * (w - u * 0.7)) / 7;
    for (const sy of [-1, 1]) {
      circ(ctx, x, sy * h * 0.28, u * 0.11); shp(ctx, '#efe9da', 'rgba(0,0,0,0.3)', u * 0.016);
      circ(ctx, x, sy * h * 0.28, u * 0.05); shp(ctx, '#d8cfb8', null);
    }
  }
  for (let i = 0; i < 3; i++) {
    const x = -w * 0.3 + i * w * 0.3;
    circ(ctx, x, 0, u * 0.07); shp(ctx, GOLD, GOLD_D, u * 0.016);
  }
});

defProp('four_poster_bed', 'Four-Poster Bed', 'furniture', { size: 2.8, snap: true }, (ctx, u) => {
  const w = u * 1.5, h = u * 2.3;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.05);
  shp(ctx, '#3d2a1c', 'rgba(0,0,0,0.55)', u * 0.045);
  rectPath(ctx, -w / 2 + u * 0.1, -h / 2 + u * 0.1, w - u * 0.2, h - u * 0.2, u * 0.04);
  shp(ctx, '#8d6d55', 'rgba(0,0,0,0.25)', u * 0.02);
  rectPath(ctx, -w / 2 + u * 0.1, -h / 2 + u * 0.12, w - u * 0.2, u * 0.42, u * 0.04);
  shp(ctx, '#eee7d4', 'rgba(0,0,0,0.2)', u * 0.02);
  rectPath(ctx, -w / 2 + u * 0.1, -h * 0.1, w - u * 0.2, h * 0.55, u * 0.04);
  shp(ctx, VELVET, GOLD_D, u * 0.022);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    circ(ctx, sx * (w / 2 - u * 0.08), sy * (h / 2 - u * 0.08), u * 0.12);
    shp(ctx, WOOD_D, 'rgba(0,0,0,0.5)', u * 0.025);
    circ(ctx, sx * (w / 2 - u * 0.08), sy * (h / 2 - u * 0.08), u * 0.05);
    shp(ctx, GOLD_D, null);
  }
});

defProp('pipe_organ', 'Pipe Organ', 'furniture', { size: 3, snap: true }, (ctx, u) => {
  const w = u * 2.6, h = u * 1.0;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.04);
  shp(ctx, WOOD_D, 'rgba(0,0,0,0.55)', u * 0.045);
  for (let i = 0; i < 14; i++) {
    const x = -w / 2 + u * 0.12 + (i * (w - u * 0.24)) / 13;
    const ph = h * (0.4 + 0.42 * Math.sin((i / 13) * Math.PI));
    rectPath(ctx, x - u * 0.055, -h / 2 + u * 0.08, u * 0.11, ph, u * 0.04);
    shp(ctx, i % 2 ? BRASS_L : BRASS, 'rgba(0,0,0,0.35)', u * 0.015);
  }
  rectPath(ctx, -w * 0.3, h * 0.16, w * 0.6, h * 0.24, u * 0.02);
  shp(ctx, '#e8e0c8', 'rgba(0,0,0,0.4)', u * 0.02);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = u * 0.012;
  ctx.beginPath();
  for (let i = 1; i < 12; i++) {
    const x = -w * 0.3 + (i * w * 0.6) / 12;
    ctx.moveTo(x, h * 0.16); ctx.lineTo(x, h * 0.4);
  }
  ctx.stroke();
});

defProp('harp', 'Harp', 'furniture', { size: 1.2, snap: true }, (ctx, u) => {
  ctx.beginPath();
  ctx.moveTo(-u * 0.26, u * 0.34);
  ctx.quadraticCurveTo(-u * 0.4, -u * 0.2, u * 0.1, -u * 0.36);
  ctx.lineTo(u * 0.2, -u * 0.24);
  ctx.quadraticCurveTo(-u * 0.24, -u * 0.1, -u * 0.12, u * 0.34);
  ctx.closePath();
  shp(ctx, GOLD_D, 'rgba(0,0,0,0.5)', u * 0.03);
  ctx.strokeStyle = rgba(hexToRgb(GOLD_L), 0.8); ctx.lineWidth = u * 0.012;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    ctx.moveTo(-u * 0.2 + t * u * 0.28, u * 0.3 - t * u * 0.1);
    ctx.lineTo(-u * 0.28 + t * u * 0.42, -u * 0.16 - t * u * 0.14);
  }
  ctx.stroke();
});

defProp('wardrobe', 'Wardrobe', 'furniture', { size: 1.4, snap: true }, (ctx, u) => {
  const w = u * 1.15, h = u * 0.6;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.04);
  shp(ctx, WOOD_D, OUTLINE, u * 0.04);
  rectPath(ctx, -w / 2 + u * 0.06, -h / 2 + u * 0.06, w / 2 - u * 0.08, h - u * 0.12, u * 0.02);
  shp(ctx, WOOD_M, 'rgba(0,0,0,0.3)', u * 0.018);
  rectPath(ctx, u * 0.02, -h / 2 + u * 0.06, w / 2 - u * 0.08, h - u * 0.12, u * 0.02);
  shp(ctx, WOOD_M, 'rgba(0,0,0,0.3)', u * 0.018);
  circ(ctx, -u * 0.04, 0, u * 0.03); shp(ctx, GOLD, null);
  circ(ctx, u * 0.04, 0, u * 0.03); shp(ctx, GOLD, null);
});

defProp('grand_clock', 'Longcase Clock', 'furniture', { size: 0.9, snap: true }, (ctx, u) => {
  rectPath(ctx, -u * 0.18, -u * 0.3, u * 0.36, u * 0.6, u * 0.04);
  shp(ctx, WOOD_D, 'rgba(0,0,0,0.5)', u * 0.035);
  circ(ctx, 0, -u * 0.13, u * 0.12); shp(ctx, '#e8e0c8', GOLD_D, u * 0.022);
  ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = u * 0.016;
  ctx.beginPath();
  ctx.moveTo(0, -u * 0.13); ctx.lineTo(0, -u * 0.2);
  ctx.moveTo(0, -u * 0.13); ctx.lineTo(u * 0.06, -u * 0.11);
  ctx.stroke();
  circ(ctx, 0, u * 0.14, u * 0.05); shp(ctx, GOLD, GOLD_D, u * 0.016);
});

defProp('display_case', 'Display Case', 'furniture', { size: 1.5, snap: true }, (ctx, u) => {
  const w = u * 1.3, h = u * 0.62;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.03);
  shp(ctx, WOOD_D, OUTLINE, u * 0.035);
  rectPath(ctx, -w / 2 + u * 0.06, -h / 2 + u * 0.06, w - u * 0.12, h - u * 0.12, u * 0.02);
  shp(ctx, 'rgba(170,205,220,0.35)', 'rgba(255,255,255,0.4)', u * 0.02);
  circ(ctx, -w * 0.22, 0, u * 0.09); shp(ctx, GOLD, GOLD_D, u * 0.018);
  poly(ctx, [[w * 0.1, -u * 0.1], [w * 0.28, -u * 0.02], [w * 0.1, u * 0.08]]);
  shp(ctx, METAL_L, 'rgba(0,0,0,0.3)', u * 0.016);
});

defProp('bookshelf_grand', 'Library Stack', 'furniture', { size: 2.6, snap: true }, (ctx, u, rnd) => {
  const w = u * 2.4, h = u * 0.7;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.03);
  shp(ctx, '#3d2a1c', OUTLINE, u * 0.04);
  const cols = ['#7d3b3b', '#3b5a7d', '#3b7d55', '#7d6b3b', '#5c3b7d', '#6b4a2b'];
  for (const sy of [-1, 1]) {
    let x = -w / 2 + u * 0.08;
    let i = 0;
    while (x < w / 2 - u * 0.1) {
      const bw = u * (0.045 + rnd(i + (sy > 0 ? 40 : 0)) * 0.05);
      rectPath(ctx, x, sy * h * 0.12 - h * 0.16, bw, h * 0.3, 0);
      shp(ctx, cols[Math.floor(rnd(i + 7) * cols.length)], 'rgba(0,0,0,0.35)', u * 0.012);
      x += bw + u * 0.01; i++;
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = u * 0.02;
  ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.stroke();
});

defProp('treasure_pile', 'Treasure Hoard', 'dressing', { size: 1.6 }, (ctx, u, rnd) => {
  blob(ctx, u * 0.62, 11, 0.3, rnd);
  shp(ctx, GOLD_D, 'rgba(0,0,0,0.4)', u * 0.03);
  for (let i = 0; i < 26; i++) {
    const a = rnd(i) * Math.PI * 2, d = u * 0.56 * Math.sqrt(rnd(i + 30));
    circ(ctx, Math.cos(a) * d, Math.sin(a) * d, u * (0.035 + rnd(i + 60) * 0.025));
    shp(ctx, rnd(i + 90) > 0.4 ? GOLD : GOLD_L, 'rgba(0,0,0,0.25)', u * 0.01);
  }
  const gems = ['#d0455a', '#4a9fd0', '#4ad07a', '#c14ad0'];
  for (let i = 0; i < 5; i++) {
    const a = rnd(i + 11) * Math.PI * 2, d = u * 0.4 * rnd(i + 21);
    starPath(ctx, u * 0.05, 4, 0.45, a);
    ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
    starPath(ctx, u * 0.055, 4, 0.45, a);
    shp(ctx, gems[i % gems.length], 'rgba(255,255,255,0.5)', u * 0.012);
    ctx.restore();
  }
});

/* ================= VEHICLES ================= */

defProp('skyship', 'Skyship', 'vehicle', { size: 12, blocks: true }, (ctx, u, rnd) => {
  const L = u * 11, B = u * 3.3;
  // hull, bow to the right
  ctx.beginPath();
  ctx.moveTo(L * 0.5, 0);
  ctx.quadraticCurveTo(L * 0.18, -B * 0.5, -L * 0.24, -B * 0.48);
  ctx.quadraticCurveTo(-L * 0.44, -B * 0.44, -L * 0.47, -B * 0.3);
  ctx.lineTo(-L * 0.47, B * 0.3);
  ctx.quadraticCurveTo(-L * 0.44, B * 0.44, -L * 0.24, B * 0.48);
  ctx.quadraticCurveTo(L * 0.18, B * 0.5, L * 0.5, 0);
  ctx.closePath();
  shp(ctx, '#5a4128', 'rgba(0,0,0,0.65)', u * 0.09);
  // deck
  ctx.save();
  ctx.clip();
  ctx.fillStyle = WOOD_M;
  ctx.fillRect(-L, -B, L * 2, B * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = u * 0.03;
  ctx.beginPath();
  for (let i = -6; i <= 6; i++) { ctx.moveTo(-L, (i * B) / 12); ctx.lineTo(L, (i * B) / 12); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  for (let i = -10; i <= 10; i++) { ctx.moveTo((i * L) / 20, -B); ctx.lineTo((i * L) / 20, B); }
  ctx.stroke();
  ctx.restore();
  // rail
  ctx.beginPath();
  ctx.moveTo(L * 0.46, 0);
  ctx.quadraticCurveTo(L * 0.16, -B * 0.42, -L * 0.23, -B * 0.4);
  ctx.quadraticCurveTo(-L * 0.41, -B * 0.37, -L * 0.43, -B * 0.25);
  ctx.lineTo(-L * 0.43, B * 0.25);
  ctx.quadraticCurveTo(-L * 0.41, B * 0.37, -L * 0.23, B * 0.4);
  ctx.quadraticCurveTo(L * 0.16, B * 0.42, L * 0.46, 0);
  ctx.closePath();
  shp(ctx, null, '#4a3117', u * 0.05);
  // stern castle
  rectPath(ctx, -L * 0.42, -B * 0.26, L * 0.16, B * 0.52, u * 0.06);
  shp(ctx, '#6b4a2b', 'rgba(0,0,0,0.5)', u * 0.045);
  rectPath(ctx, -L * 0.4, -B * 0.2, L * 0.12, B * 0.4, u * 0.04);
  shp(ctx, WOOD_L, null);
  // masts and furled sails
  for (const mx of [-L * 0.16, L * 0.1]) {
    ctx.save(); ctx.translate(mx, 0);
    ctx.strokeStyle = 'rgba(235,228,208,0.75)'; ctx.lineWidth = u * 0.14;
    ctx.beginPath(); ctx.moveTo(0, -B * 0.38); ctx.lineTo(0, B * 0.38); ctx.stroke();
    circ(ctx, 0, 0, u * 0.24); shp(ctx, '#4a3117', 'rgba(0,0,0,0.6)', u * 0.05);
    circ(ctx, 0, 0, u * 0.13); shp(ctx, '#7d5c3a', null);
    ctx.restore();
  }
  // wing fins
  for (const s of [-1, 1]) {
    poly(ctx, [[-L * 0.06, s * B * 0.46], [L * 0.06, s * B * 0.46],
    [L * 0.02, s * B * 0.86], [-L * 0.12, s * B * 0.8]]);
    shp(ctx, 'rgba(190,170,130,0.85)', 'rgba(0,0,0,0.5)', u * 0.05);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = u * 0.025;
    ctx.beginPath();
    ctx.moveTo(-L * 0.04, s * B * 0.5); ctx.lineTo(-L * 0.06, s * B * 0.78);
    ctx.moveTo(L * 0.02, s * B * 0.5); ctx.lineTo(L * 0.0, s * B * 0.8);
    ctx.stroke();
  }
  // helm and hatch
  circ(ctx, -L * 0.3, 0, u * 0.2); shp(ctx, '#7d5c3a', '#3a2a1c', u * 0.04);
  ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = u * 0.03;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(-L * 0.3 + Math.cos(a) * u * 0.06, Math.sin(a) * u * 0.06);
    ctx.lineTo(-L * 0.3 + Math.cos(a) * u * 0.26, Math.sin(a) * u * 0.26);
    ctx.stroke();
  }
  rectPath(ctx, -L * 0.02, -B * 0.16, L * 0.1, B * 0.32, u * 0.04);
  shp(ctx, '#3a2a1c', '#5a4128', u * 0.04);
  // bowsprit
  ctx.strokeStyle = '#4a3117'; ctx.lineWidth = u * 0.09;
  ctx.beginPath(); ctx.moveTo(L * 0.46, 0); ctx.lineTo(L * 0.62, 0); ctx.stroke();
});

defProp('sky_skiff', 'Sky Skiff', 'vehicle', { size: 5, blocks: true }, (ctx, u) => {
  const L = u * 4.4, B = u * 1.5;
  ctx.beginPath();
  ctx.moveTo(L * 0.5, 0);
  ctx.quadraticCurveTo(L * 0.1, -B * 0.5, -L * 0.42, -B * 0.36);
  ctx.lineTo(-L * 0.46, 0);
  ctx.lineTo(-L * 0.42, B * 0.36);
  ctx.quadraticCurveTo(L * 0.1, B * 0.5, L * 0.5, 0);
  ctx.closePath();
  shp(ctx, '#5a4128', 'rgba(0,0,0,0.6)', u * 0.07);
  ctx.save(); ctx.clip();
  ctx.fillStyle = WOOD_M; ctx.fillRect(-L, -B, L * 2, B * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = u * 0.028;
  ctx.beginPath();
  for (let i = -4; i <= 4; i++) { ctx.moveTo(-L, (i * B) / 8); ctx.lineTo(L, (i * B) / 8); }
  ctx.stroke();
  ctx.restore();
  // single mast with a triangular sail
  ctx.save(); ctx.translate(-L * 0.05, 0);
  poly(ctx, [[0, -B * 0.06], [L * 0.3, -B * 0.5], [L * 0.04, -B * 0.52]]);
  shp(ctx, 'rgba(238,232,214,0.8)', 'rgba(0,0,0,0.35)', u * 0.03);
  circ(ctx, 0, 0, u * 0.16); shp(ctx, '#4a3117', 'rgba(0,0,0,0.55)', u * 0.035);
  ctx.restore();
  for (const s of [-1, 1]) {
    poly(ctx, [[-L * 0.1, s * B * 0.44], [L * 0.02, s * B * 0.44], [-L * 0.06, s * B * 0.8]]);
    shp(ctx, 'rgba(190,170,130,0.85)', 'rgba(0,0,0,0.45)', u * 0.04);
  }
  circ(ctx, -L * 0.34, 0, u * 0.13); shp(ctx, '#7d5c3a', '#3a2a1c', u * 0.03);
});

defProp('ships_wheel', 'Ship’s Wheel', 'vehicle', { size: 0.9, snap: true }, (ctx, u) => {
  circ(ctx, 0, 0, u * 0.3); shp(ctx, null, WOOD_D, u * 0.07);
  circ(ctx, 0, 0, u * 0.3); shp(ctx, null, WOOD_L, u * 0.03);
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = u * 0.035;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * u * 0.38, Math.sin(a) * u * 0.38);
    ctx.stroke();
  }
  circ(ctx, 0, 0, u * 0.09); shp(ctx, BRASS, BRASS_D, u * 0.02);
});

defProp('ballista', 'Ballista', 'vehicle', { size: 1.8, snap: true }, (ctx, u) => {
  rectPath(ctx, -u * 0.5, -u * 0.24, u * 1.0, u * 0.48, u * 0.05);
  shp(ctx, WOOD_D, 'rgba(0,0,0,0.55)', u * 0.04);
  rectPath(ctx, -u * 0.42, -u * 0.09, u * 0.9, u * 0.18, u * 0.03);
  shp(ctx, WOOD_L, 'rgba(0,0,0,0.3)', u * 0.02);
  // bow arms
  ctx.strokeStyle = '#4a3117'; ctx.lineWidth = u * 0.06;
  ctx.beginPath();
  ctx.moveTo(u * 0.22, -u * 0.42); ctx.quadraticCurveTo(u * 0.42, 0, u * 0.22, u * 0.42);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(230,225,210,0.8)'; ctx.lineWidth = u * 0.018;
  ctx.beginPath(); ctx.moveTo(u * 0.22, -u * 0.42); ctx.lineTo(u * 0.22, u * 0.42); ctx.stroke();
  // bolt
  ctx.strokeStyle = METAL_L; ctx.lineWidth = u * 0.035;
  ctx.beginPath(); ctx.moveTo(-u * 0.2, 0); ctx.lineTo(u * 0.5, 0); ctx.stroke();
  poly(ctx, [[u * 0.5, 0], [u * 0.4, -u * 0.06], [u * 0.4, u * 0.06]]);
  shp(ctx, METAL_M, null);
  for (const sy of [-1, 1]) { circ(ctx, -u * 0.34, sy * u * 0.26, u * 0.12); shp(ctx, '#3a2a1c', 'rgba(0,0,0,0.5)', u * 0.025); }
});

defProp('catapult', 'Catapult', 'vehicle', { size: 2.4, snap: true }, (ctx, u) => {
  rectPath(ctx, -u * 0.7, -u * 0.34, u * 1.4, u * 0.68, u * 0.05);
  shp(ctx, WOOD_D, 'rgba(0,0,0,0.55)', u * 0.045);
  rectPath(ctx, -u * 0.6, -u * 0.12, u * 1.2, u * 0.24, u * 0.03);
  shp(ctx, WOOD_M, 'rgba(0,0,0,0.3)', u * 0.02);
  ctx.strokeStyle = '#4a3117'; ctx.lineWidth = u * 0.09;
  ctx.beginPath(); ctx.moveTo(-u * 0.3, 0); ctx.lineTo(u * 0.55, 0); ctx.stroke();
  circ(ctx, u * 0.62, 0, u * 0.2); shp(ctx, '#5a4128', 'rgba(0,0,0,0.5)', u * 0.035);
  circ(ctx, u * 0.62, 0, u * 0.13); shp(ctx, '#6d675d', 'rgba(0,0,0,0.4)', u * 0.025);
  ctx.strokeStyle = 'rgba(230,225,210,0.75)'; ctx.lineWidth = u * 0.025;
  ctx.beginPath(); ctx.moveTo(-u * 0.34, -u * 0.28); ctx.lineTo(-u * 0.34, u * 0.28); ctx.stroke();
  for (const sy of [-1, 1]) for (const sx of [-1, 1]) {
    circ(ctx, sx * u * 0.44, sy * u * 0.38, u * 0.15);
    shp(ctx, '#3a2a1c', 'rgba(0,0,0,0.5)', u * 0.03);
  }
});

defProp('wagon_covered', 'Covered Wagon', 'vehicle', { size: 3, snap: true }, (ctx, u) => {
  const w = u * 2.6, h = u * 1.3;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.05);
  shp(ctx, WOOD_D, 'rgba(0,0,0,0.55)', u * 0.045);
  rectPath(ctx, -w / 2 + u * 0.14, -h / 2 + u * 0.08, w - u * 0.28, h - u * 0.16, u * 0.12);
  shp(ctx, '#ddd5be', 'rgba(0,0,0,0.35)', u * 0.03);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = u * 0.03;
  ctx.beginPath();
  for (let i = 1; i < 6; i++) {
    const x = -w / 2 + u * 0.14 + (i * (w - u * 0.28)) / 6;
    ctx.moveTo(x, -h / 2 + u * 0.08); ctx.lineTo(x, h / 2 - u * 0.08);
  }
  ctx.stroke();
  for (const sy of [-1, 1]) for (const sx of [-1, 1]) {
    circ(ctx, sx * w * 0.3, sy * h * 0.54, u * 0.22);
    shp(ctx, '#3a2a1c', 'rgba(0,0,0,0.5)', u * 0.035);
    circ(ctx, sx * w * 0.3, sy * h * 0.54, u * 0.07); shp(ctx, '#7d5c3a', null);
  }
});

defProp('gangplank', 'Gangplank', 'vehicle', { size: 2.6, snap: true }, (ctx, u) => {
  const w = u * 2.4, h = u * 0.55;
  rectPath(ctx, -w / 2, -h / 2, w, h, u * 0.02);
  shp(ctx, WOOD_M, 'rgba(0,0,0,0.5)', u * 0.035);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = u * 0.022;
  ctx.beginPath();
  for (let i = 1; i < 9; i++) {
    const x = -w / 2 + (i * w) / 9;
    ctx.moveTo(x, -h / 2); ctx.lineTo(x, h / 2);
  }
  ctx.stroke();
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = u * 0.05;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2);
  ctx.moveTo(-w / 2, h / 2); ctx.lineTo(w / 2, h / 2);
  ctx.stroke();
});

/* categories added by this file */
for (const c of ['grand', 'arcane', 'vehicle']) {
  if (PROP_CATEGORIES.indexOf(c) === -1) PROP_CATEGORIES.push(c);
}
