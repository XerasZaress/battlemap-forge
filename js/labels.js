/* Battlemap Forge — map labels.
 *
 * A battlemap that comes out of a generator is anonymous: the players see a
 * room, the GM sees room 14, and neither of them sees "The Rusty Flagon" or
 * "collapsed floor — DC 14 Dex" unless somebody writes it on. Inkarnate's text
 * tool is the model here, down to the details that matter on a map rather than
 * in a document: an outline so the type survives whatever colour the floor
 * happens to be, a drop shadow so it lifts off the art, letter spacing for the
 * wide sparse look map labels use, and a curve so a river or a coastline can be
 * named along its own line rather than across it.
 *
 * A label is an object on the map, not paint: it moves, turns and re-styles
 * after the fact, it survives a save, and it is drawn last so nothing — fog,
 * grid, lighting — can bury it.
 *
 * Everything is measured in grid units, so a label keeps its size relative to
 * the map at any export resolution: a 1.2-unit label is a bit over a square
 * tall whether that square is 35 px or 140.
 */
'use strict';

/* Stacks rather than web fonts: the tool is meant to work off a file:// path
   with no network, so anything that has to be fetched is not an option. Each
   entry names faces that are actually present on macOS or Windows and falls
   back through to a generic. */
const LABEL_FONTS = [
  { key: 'serif', label: 'Serif', stack: 'Georgia, "Times New Roman", serif' },
  { key: 'oldstyle', label: 'Old style', stack: '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif' },
  { key: 'inscription', label: 'Inscription', stack: 'Copperplate, "Copperplate Gothic Light", "Trajan Pro", Optima, Georgia, serif' },
  { key: 'fantasy', label: 'Fantasy', stack: 'Luminari, Herculanum, Papyrus, fantasy' },
  { key: 'script', label: 'Script', stack: '"Snell Roundhand", "Segoe Script", "Brush Script MT", cursive' },
  { key: 'sans', label: 'Sans', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { key: 'condensed', label: 'Poster', stack: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' },
  { key: 'mono', label: 'Typewriter', stack: '"Courier New", Courier, monospace' }
];
const LABEL_FONT_BY_KEY = {};
for (const f of LABEL_FONTS) LABEL_FONT_BY_KEY[f.key] = f;

const LABEL_NEWLINE = String.fromCharCode(10);

function defaultLabel() {
  return {
    text: 'Label',
    x: 0, y: 0,
    size: 1,            // font size in grid units
    font: 'oldstyle',
    bold: false,
    italic: false,
    color: '#f4ead6',
    outline: '#1a1410',
    outlineW: 0.14,     // fraction of the font size
    shadow: true,
    letter: 0.08,       // extra tracking, fraction of the font size
    lineH: 1.25,
    align: 'center',
    rot: 0,             // radians
    curve: 0,           // -1..1; how far the baseline bends
    opacity: 1
  };
}

function labelFontString(l, px) {
  const stack = (LABEL_FONT_BY_KEY[l.font] || LABEL_FONT_BY_KEY.oldstyle).stack;
  return (l.italic ? 'italic ' : '') + (l.bold ? '700 ' : '400 ') + px + 'px ' + stack;
}

/* ---------------- measuring ----------------
   Hit testing and the selection outline both need a box, and both ask for it
   far more often than the label changes, so the measurement is cached against
   everything that could move it. */

let _measureCtx = null;
function measureCtx() {
  if (!_measureCtx) _measureCtx = makeCanvas(8, 8).getContext('2d');
  return _measureCtx;
}

function labelLines(l) {
  return String(l.text === undefined ? '' : l.text).split(LABEL_NEWLINE);
}

function labelSigOf(l) {
  return [l.text, l.size, l.font, l.bold, l.italic, l.letter, l.lineH, l.curve, l.align].join('|');
}

/** Width and height in grid units, unrotated, around the label's own origin. */
function labelMetrics(l) {
  const sig = labelSigOf(l);
  if (l._sig === sig && l._m) return l._m;
  const REF = 100;                       // measure at a fixed size, then scale
  const ctx = measureCtx();
  ctx.font = labelFontString(l, REF);
  const lines = labelLines(l);
  const track = (l.letter || 0) * REF;
  let w = 0;
  for (const line of lines) {
    const lw = ctx.measureText(line).width + track * Math.max(0, line.length - 1);
    if (lw > w) w = lw;
  }
  const lineH = REF * (l.lineH || 1.25);
  const h = lineH * lines.length;
  const k = (l.size || 1) / REF;
  // a curved run bows out of its straight box; widen the box to cover the bow
  const bow = Math.abs(l.curve || 0) * w * 0.5;
  // Alignment decides which end of the run sits on the label's own point, so
  // the box is not always centred on it. Without this the hit target and the
  // selection outline sit half a label away from the text for anything not
  // centred.
  const anchor = l.align === 'left' ? 0 : l.align === 'right' ? 1 : 0.5;
  const m = {
    w: Math.max(w * k, 0.2), h: h * k, bow: bow * k, lines: lines.length,
    cx: (0.5 - anchor) * w * k
  };
  l._sig = sig; l._m = m;
  return m;
}

/** Half-extents of the rotated label, in grid units: hw/hh in the label's own
    frame, x/y after rotation for anything that wants an axis-aligned box. */
function labelHalfExtents(l) {
  const m = labelMetrics(l);
  const hw = m.w / 2, hh = (m.h + m.bow) / 2;
  const c = Math.abs(Math.cos(l.rot || 0)), s = Math.abs(Math.sin(l.rot || 0));
  return { x: hw * c + hh * s, y: hw * s + hh * c, hw, hh, cx: m.cx };
}

function labelHit(l, fx, fy) {
  const dx = fx - l.x, dy = fy - l.y;
  const a = -(l.rot || 0);
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  const e = labelHalfExtents(l);
  // a pad, because clicking the counter inside an O should still select it
  const pad = Math.max(0.1, (l.size || 1) * 0.15);
  return Math.abs(lx - e.cx) <= e.hw + pad && Math.abs(ly) <= e.hh + pad;
}

/** Topmost label under the point, or null. Later labels sit over earlier ones. */
/* `editableOnly` keeps the cursor off labels on a hidden or locked layer, the
   same rule the props follow. Drawing ignores it: a locked layer still shows. */
function pickLabel(map, fx, fy, editableOnly) {
  const list = map.labels || [];
  // topmost first, which with sublayers is no longer simply the last written
  const order = list.map((l, i) => i).sort((a, b) => objSub(list[b]) - objSub(list[a]) || b - a);
  for (const i of order) {
    if (editableOnly && !objEditable(map, list[i])) continue;
    if (labelHit(list[i], fx, fy)) return i;
  }
  return null;
}

/* ---------------- drawing ---------------- */

/** Lay one line out as glyphs with their own position and angle. Straight text
    is the degenerate case of a curve of zero, so both go through here and the
    two can never drift apart. */
function layoutLine(ctx, line, track, curve, align, y) {
  const glyphs = Array.from(line);
  const widths = glyphs.map(ch => ctx.measureText(ch).width);
  let total = track * Math.max(0, glyphs.length - 1);
  for (const w of widths) total += w;
  const runs = [];

  if (!curve) {
    const start = align === 'left' ? 0 : align === 'right' ? -total : -total / 2;
    let x = start;
    for (let i = 0; i < glyphs.length; i++) {
      runs.push({ ch: glyphs[i], x: x + widths[i] / 2, y, a: 0 });
      x += widths[i] + track;
    }
    return runs;
  }

  // curve is the fraction of a half-turn the whole run subtends. The sign
  // decides which way it bows and nothing else: the angle always advances with
  // the reading direction, or a negative curve would set the line backwards.
  const sweep = Math.abs(curve) * Math.PI * 0.9;
  const radius = total / sweep;
  const dir = curve > 0 ? 1 : -1;              // +1 over a hill, -1 round a bay
  const anchor = align === 'left' ? 0 : align === 'right' ? 1 : 0.5;
  const cy = y + radius * dir;                 // centre of the arc
  let along = 0;
  for (let i = 0; i < glyphs.length; i++) {
    const frac = total ? (along + widths[i] / 2) / total : 0.5;
    const ang = (frac - anchor) * sweep;
    runs.push({
      ch: glyphs[i],
      x: Math.sin(ang) * radius,
      y: cy - Math.cos(ang) * radius * dir,
      a: ang * dir
    });
    along += widths[i] + track;
  }
  return runs;
}

function paintGlyphRuns(ctx, l, px, runs) {
  const outlineW = (l.outlineW || 0) * px;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  // Two passes over the whole label rather than outline-then-fill per glyph:
  // otherwise a later glyph's outline eats its neighbour's face wherever tight
  // tracking makes the two touch.
  if (outlineW > 0.4 && l.outline) {
    ctx.strokeStyle = l.outline;
    ctx.lineWidth = outlineW * 2;      // half of it ends up under the fill
    if (l.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = px * 0.22;
      ctx.shadowOffsetY = px * 0.06;
    }
    for (const r of runs) {
      ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.a); ctx.strokeText(r.ch, 0, 0); ctx.restore();
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  } else if (l.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = px * 0.2;
    ctx.shadowOffsetY = px * 0.06;
  }
  ctx.fillStyle = l.color || '#ffffff';
  for (const r of runs) {
    ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.a); ctx.fillText(r.ch, 0, 0); ctx.restore();
  }
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
}

function drawLabel(ctx, l, u) {
  const text = String(l.text === undefined ? '' : l.text);
  if (!text.trim()) return;
  const px = (l.size || 1) * u;
  if (px < 1) return;
  const lines = labelLines(l);
  const track = (l.letter || 0) * px;
  const lineH = px * (l.lineH || 1.25);

  ctx.save();
  ctx.globalAlpha = l.opacity === undefined ? 1 : clamp(l.opacity, 0, 1);
  ctx.translate(l.x * u, l.y * u);
  ctx.rotate(l.rot || 0);
  ctx.font = labelFontString(l, px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const top = -((lines.length - 1) * lineH) / 2;
  const runs = [];
  for (let i = 0; i < lines.length; i++)
    runs.push.apply(runs, layoutLine(ctx, lines[i], track, l.curve || 0, l.align || 'center', top + i * lineH));
  paintGlyphRuns(ctx, l, px, runs);
  ctx.restore();
}

function drawLabels(ctx, map, u) {
  const list = map.labels;
  if (!list || !list.length) return;
  const shown = list.filter(l => objVisible(map, l)).sort((a, b) => objSub(a) - objSub(b));
  for (const l of shown) drawLabel(ctx, l, u);
}
