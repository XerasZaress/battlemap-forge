/* Battlemap Forge — prop editor.
 *
 * A vector workspace for authoring props: shape tools, a pen, direct point
 * editing, fills and gradients, arrange/align, and the metadata that turns the
 * drawing into a real prop (footprint, line of sight, light).
 */
'use strict';

const PE = {
  open: false,
  shapes: [],
  sel: [],                 // indices into shapes
  tool: 'select',
  view: { x: 0, y: 0, zoom: 200 },   // zoom = px per grid unit
  undo: [], redo: [],
  drag: null,
  pen: null,               // in-progress path
  nodeSel: null,           // {shape, node, part:'point'|'in'|'out'}
  meta: { key: null, label: 'New Prop', size: 1, blocks: false, under: false, snap: true, light: null },
  grid: true, snapGrid: false,
  style: {
    fill: { kind: 'solid', color: '#8a6238' },
    stroke: { color: '#2b2b33', width: 0.03, cap: 'round', join: 'round', dash: 0 },
    strokeOn: true, fillOn: true
  },
  canvas: null, ctx: null
};

const PE_SWATCHES = [
  '#6b4a2b', '#8a6238', '#4a3117', '#3a2a1c',
  '#8b8578', '#5e594f', '#b5afa3', '#e2dcd0',
  '#6b7280', '#9aa3ad', '#3c4048', '#c9a227',
  '#f2dc86', '#8a6a12', '#7a2a2a', '#a03b38',
  '#2f5f73', '#3f7f95', '#3f6b34', '#5c8c42',
  '#ff7a1a', '#ffe08a', '#7fd8ff', '#a06fe8',
  '#e8e0c8', '#ffffff', '#000000', 'rgba(0,0,0,0.35)'
];

/* ---------------- lifecycle ---------------- */

function peOpen(existingKey) {
  PE.open = true;
  $('propEditor').classList.add('on');
  PE.canvas = $('peCanvas');
  PE.ctx = PE.canvas.getContext('2d');

  if (existingKey && CUSTOM_PROPS[existingKey] && CUSTOM_PROPS[existingKey].image) {
    peToast('That one is a picture, so there are no shapes to edit. Its settings are below.', 5000);
  }
  if (existingKey && CUSTOM_PROPS[existingKey]) {
    const d = CUSTOM_PROPS[existingKey];
    PE.shapes = vClone(d.shapes);
    PE.meta = {
      key: d.key, label: d.label, size: d.size, blocks: !!d.blocks,
      under: !!d.under, snap: !!d.snap, light: d.light ? vClone(d.light) : null
    };
  } else {
    const t = buildTemplate('blank');
    PE.shapes = t.shapes;
    PE.meta = { key: null, label: 'New Prop', size: 1, blocks: false, under: false, snap: true, light: null };
  }
  PE.sel = []; PE.undo = []; PE.redo = []; PE.pen = null; PE.nodeSel = null;
  peSetTool('select');
  peSyncMeta();
  peBuildLayers();
  peFit();
}

function peClose() {
  PE.open = false;
  $('propEditor').classList.remove('on');
}

function peSnapshot() {
  PE.undo.push({ shapes: vClone(PE.shapes), sel: PE.sel.slice() });
  if (PE.undo.length > 60) PE.undo.shift();
  PE.redo.length = 0;
}
function peUndo() {
  if (!PE.undo.length) return;
  PE.redo.push({ shapes: vClone(PE.shapes), sel: PE.sel.slice() });
  const s = PE.undo.pop();
  PE.shapes = s.shapes; PE.sel = s.sel;
  peBuildLayers(); peDraw(); peSyncStylePanel();
}
function peRedo() {
  if (!PE.redo.length) return;
  PE.undo.push({ shapes: vClone(PE.shapes), sel: PE.sel.slice() });
  const s = PE.redo.pop();
  PE.shapes = s.shapes; PE.sel = s.sel;
  peBuildLayers(); peDraw(); peSyncStylePanel();
}

/* ---------------- view ---------------- */

function peFit() {
  const c = PE.canvas;
  const size = Math.max(1, PE.meta.size);
  const pad = 1.3;
  const z = Math.min(c.clientWidth / (size * pad), c.clientHeight / (size * pad));
  PE.view.zoom = z;
  PE.view.x = c.clientWidth / 2;
  PE.view.y = c.clientHeight / 2;
  peDraw();
}

const peToScreen = (x, y) => [PE.view.x + x * PE.view.zoom, PE.view.y + y * PE.view.zoom];
const peToUnit = (sx, sy) => [(sx - PE.view.x) / PE.view.zoom, (sy - PE.view.y) / PE.view.zoom];

function pePos(ev) {
  const r = PE.canvas.getBoundingClientRect();
  const [x, y] = peToUnit(ev.clientX - r.left, ev.clientY - r.top);
  if (PE.snapGrid) {
    const g = 0.125;
    return [Math.round(x / g) * g, Math.round(y / g) * g];
  }
  return [x, y];
}

/* ---------------- drawing the workspace ---------------- */

function peDraw() {
  const c = PE.canvas, ctx = PE.ctx;
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // chequerboard so transparency is legible
  const q = 12;
  for (let y = 0; y < h; y += q) for (let x = 0; x < w; x += q) {
    ctx.fillStyle = ((x / q + y / q) | 0) % 2 ? '#262b36' : '#2e3444';
    ctx.fillRect(x, y, q, q);
  }

  const z = PE.view.zoom;
  // grid squares
  if (PE.grid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const half = Math.ceil(Math.max(w, h) / z) + 2;
    for (let i = -half; i <= half; i++) {
      const [px] = peToScreen(i, 0), [, py] = peToScreen(0, i);
      ctx.moveTo(Math.round(px) + 0.5, 0); ctx.lineTo(Math.round(px) + 0.5, h);
      ctx.moveTo(0, Math.round(py) + 0.5); ctx.lineTo(w, Math.round(py) + 0.5);
    }
    ctx.stroke();
    // eighth-square guides
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.beginPath();
    for (let i = -half * 8; i <= half * 8; i++) {
      if (i % 8 === 0) continue;
      const [px] = peToScreen(i / 8, 0), [, py] = peToScreen(0, i / 8);
      ctx.moveTo(Math.round(px) + 0.5, 0); ctx.lineTo(Math.round(px) + 0.5, h);
      ctx.moveTo(0, Math.round(py) + 0.5); ctx.lineTo(w, Math.round(py) + 0.5);
    }
    ctx.stroke();
  }

  // the prop's declared footprint
  const s = PE.meta.size;
  const [fx, fy] = peToScreen(-s / 2, -s / 2);
  ctx.strokeStyle = 'rgba(201,162,39,0.75)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 5]);
  ctx.strokeRect(fx, fy, s * z, s * z);
  ctx.setLineDash([]);

  // artwork
  ctx.save();
  ctx.translate(PE.view.x, PE.view.y);
  ctx.scale(z, z);
  drawShapes(ctx, PE.shapes);
  ctx.restore();

  peDrawOverlay(ctx);
}

function peDrawOverlay(ctx) {
  const z = PE.view.zoom;

  // selection outlines
  for (const i of PE.sel) {
    const sh = PE.shapes[i]; if (!sh) continue;
    const b = shapeBBox(sh);
    const [x, y] = peToScreen(b.x, b.y);
    ctx.strokeStyle = 'rgba(201,162,39,0.95)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x, y, b.w * z, b.h * z);
    ctx.setLineDash([]);
  }
  // transform handles on a single selection
  if (PE.sel.length && PE.tool === 'select') {
    const b = shapesBBox(PE.sel.map(i => PE.shapes[i]).filter(Boolean));
    const [x, y] = peToScreen(b.x, b.y);
    const w = b.w * z, h = b.h * z;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1;
    for (const [hx, hy] of peHandlePoints(x, y, w, h)) {
      ctx.beginPath(); ctx.rect(hx - 4, hy - 4, 8, 8); ctx.fill(); ctx.stroke();
    }
  }

  // anchor points when editing nodes or drawing
  if (PE.tool === 'node' || PE.tool === 'pen') {
    const list = PE.tool === 'pen' && PE.pen ? [PE.pen] : PE.sel.map(i => PE.shapes[i]).filter(Boolean);
    for (const sh of list) {
      if (!sh || sh.type !== 'path') continue;
      for (let n = 0; n < sh.nodes.length; n++) {
        const nd = sh.nodes[n];
        const [px, py] = peToScreen(nd.x, nd.y);
        // handles
        for (const part of ['hIn', 'hOut']) {
          const hv = nd[part];
          if (!hv || (!hv[0] && !hv[1])) continue;
          const [hx, hy] = peToScreen(nd.x + hv[0], nd.y + hv[1]);
          ctx.strokeStyle = 'rgba(127,216,255,0.8)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(hx, hy); ctx.stroke();
          ctx.fillStyle = '#7fd8ff';
          ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, Math.PI * 2); ctx.fill();
        }
        const isSel = PE.nodeSel && PE.nodeSel.shape === sh && PE.nodeSel.node === n;
        ctx.fillStyle = isSel ? '#c9a227' : '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.rect(px - 3.5, py - 3.5, 7, 7); ctx.fill(); ctx.stroke();
      }
    }
  }

  // live shape being dragged out
  if (PE.drag && PE.drag.preview) {
    ctx.save();
    ctx.translate(PE.view.x, PE.view.y); ctx.scale(z, z);
    drawShape(ctx, PE.drag.preview);
    ctx.restore();
  }
  // marquee
  if (PE.drag && PE.drag.mode === 'marquee') {
    const [x0, y0] = peToScreen(PE.drag.ax, PE.drag.ay);
    const [x1, y1] = peToScreen(PE.drag.bx, PE.drag.by);
    ctx.strokeStyle = 'rgba(201,162,39,0.9)'; ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.setLineDash([]);
  }
}

function peHandlePoints(x, y, w, h) {
  return [[x, y], [x + w / 2, y], [x + w, y], [x + w, y + h / 2],
  [x + w, y + h], [x + w / 2, y + h], [x, y + h], [x, y + h / 2]];
}
const PE_HANDLE_DIRS = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

/* ---------------- tools ---------------- */

function peSetTool(t) {
  PE.tool = t;
  if (t !== 'pen' && PE.pen) peFinishPen();
  for (const b of document.querySelectorAll('#peTools button'))
    b.classList.toggle('active', b.dataset.petool === t);
  PE.canvas.style.cursor = t === 'pen' ? 'crosshair' : t === 'hand' ? 'grab' : 'default';
  peDraw();
}

function peStyleFor(shape) {
  if (PE.style.fillOn) shape.fill = vClone(PE.style.fill); else shape.fill = null;
  if (PE.style.strokeOn) shape.stroke = vClone(PE.style.stroke); else shape.stroke = null;
  return shape;
}

function peAdd(shape) {
  peSnapshot();
  PE.shapes.push(shape);
  PE.sel = [PE.shapes.length - 1];
  peBuildLayers(); peDraw();
}

function peHitShape(x, y) {
  for (let i = PE.shapes.length - 1; i >= 0; i--) {
    if (shapeHit(PE.shapes[i], x, y, 6 / PE.view.zoom)) return i;
  }
  return -1;
}

function peHitNode(x, y) {
  const tol = 7 / PE.view.zoom;
  const list = PE.sel.map(i => PE.shapes[i]).filter(s => s && s.type === 'path');
  for (const sh of list) {
    for (let n = 0; n < sh.nodes.length; n++) {
      const nd = sh.nodes[n];
      for (const part of ['hOut', 'hIn']) {
        const hv = nd[part];
        if (!hv || (!hv[0] && !hv[1])) continue;
        if (Math.hypot(nd.x + hv[0] - x, nd.y + hv[1] - y) < tol) return { shape: sh, node: n, part };
      }
      if (Math.hypot(nd.x - x, nd.y - y) < tol) return { shape: sh, node: n, part: 'point' };
    }
  }
  return null;
}

function peFinishPen() {
  if (PE.pen && PE.pen.nodes.length > 1) {
    PE.shapes.push(PE.pen);
    PE.sel = [PE.shapes.length - 1];
    peBuildLayers();
  }
  PE.pen = null;
  peDraw();
}

/* ---------------- pointer handling ---------------- */

function peBindCanvas() {
  const c = PE.canvas;
  c.addEventListener('contextmenu', e => e.preventDefault());

  c.addEventListener('pointerdown', (ev) => {
    c.setPointerCapture(ev.pointerId);
    const [x, y] = pePos(ev);
    const panning = ev.button === 1 || PE.tool === 'hand' || ev.spaceKey;

    if (panning) {
      PE.drag = { mode: 'pan', sx: ev.clientX, sy: ev.clientY, vx: PE.view.x, vy: PE.view.y };
      return;
    }

    if (PE.tool === 'pen') {
      if (!PE.pen) {
        PE.pen = peStyleFor(vPath([vNode(x, y)], false));
      } else {
        const first = PE.pen.nodes[0];
        if (PE.pen.nodes.length > 1 && Math.hypot(first.x - x, first.y - y) < 10 / PE.view.zoom) {
          PE.pen.closed = true;
          peSnapshot(); peFinishPen(); return;
        }
        PE.pen.nodes.push(vNode(x, y));
      }
      PE.drag = { mode: 'pen-handle', node: PE.pen.nodes[PE.pen.nodes.length - 1], ax: x, ay: y };
      peDraw();
      return;
    }

    if (PE.tool === 'node') {
      const hit = peHitNode(x, y);
      if (hit) {
        peSnapshot();
        PE.nodeSel = hit;
        PE.drag = { mode: 'node', hit, ax: x, ay: y, alt: ev.altKey };
        peDraw(); return;
      }
      const i = peHitShape(x, y);
      PE.sel = i >= 0 ? [i] : [];
      if (i >= 0 && PE.shapes[i].type !== 'path') {
        peSnapshot();
        PE.shapes[i] = shapeToPath(PE.shapes[i]);   // make it editable
      }
      peBuildLayers(); peDraw(); peSyncStylePanel();
      return;
    }

    if (PE.tool === 'select') {
      // transform handle?
      if (PE.sel.length) {
        const b = shapesBBox(PE.sel.map(i => PE.shapes[i]).filter(Boolean));
        const [bx, by] = peToScreen(b.x, b.y);
        const pts = peHandlePoints(bx, by, b.w * PE.view.zoom, b.h * PE.view.zoom);
        const r = c.getBoundingClientRect();
        const mx = ev.clientX - r.left, my = ev.clientY - r.top;
        for (let k = 0; k < pts.length; k++) {
          if (Math.hypot(pts[k][0] - mx, pts[k][1] - my) < 9) {
            peSnapshot();
            PE.drag = { mode: 'scale', dir: PE_HANDLE_DIRS[k], box: b, orig: vClone(PE.sel.map(i => PE.shapes[i])) };
            return;
          }
        }
      }
      const i = peHitShape(x, y);
      if (i < 0) {
        PE.drag = { mode: 'marquee', ax: x, ay: y, bx: x, by: y };
        if (!ev.shiftKey) PE.sel = [];
        peDraw(); peSyncStylePanel();
        return;
      }
      if (ev.shiftKey) {
        const at = PE.sel.indexOf(i);
        if (at >= 0) PE.sel.splice(at, 1); else PE.sel.push(i);
      } else if (PE.sel.indexOf(i) < 0) {
        PE.sel = [i];
      }
      peSnapshot();
      PE.drag = { mode: 'move', ax: x, ay: y, moved: false };
      peBuildLayers(); peDraw(); peSyncStylePanel();
      return;
    }

    // shape tools drag out a primitive
    if (['rect', 'ellipse', 'poly', 'star', 'line'].indexOf(PE.tool) >= 0) {
      PE.drag = { mode: 'create', ax: x, ay: y, preview: null };
      return;
    }
  });

  c.addEventListener('pointermove', (ev) => {
    const [x, y] = pePos(ev);
    const d = PE.drag;
    $('peCoord').textContent = x.toFixed(2) + ', ' + y.toFixed(2);
    if (!d) return;

    if (d.mode === 'pan') {
      PE.view.x = d.vx + (ev.clientX - d.sx);
      PE.view.y = d.vy + (ev.clientY - d.sy);
      peDraw(); return;
    }
    if (d.mode === 'pen-handle') {
      const dx = x - d.ax, dy = y - d.ay;
      d.node.hOut = [dx, dy];
      d.node.hIn = ev.altKey ? [0, 0] : [-dx, -dy];
      peDraw(); return;
    }
    if (d.mode === 'node') {
      const h = d.hit, nd = h.shape.nodes[h.node];
      if (h.part === 'point') {
        const ddx = x - d.ax, ddy = y - d.ay;
        nd.x += ddx; nd.y += ddy; d.ax = x; d.ay = y;
      } else {
        const v = [x - nd.x, y - nd.y];
        nd[h.part] = v;
        if (!d.alt) {
          const other = h.part === 'hIn' ? 'hOut' : 'hIn';
          const len = Math.hypot(nd[other][0], nd[other][1]);
          const m = Math.hypot(v[0], v[1]) || 1;
          nd[other] = len ? [-v[0] / m * len, -v[1] / m * len] : [-v[0], -v[1]];
        }
      }
      peDraw(); return;
    }
    if (d.mode === 'move') {
      const ddx = x - d.ax, ddy = y - d.ay;
      if (ddx || ddy) d.moved = true;
      for (const i of PE.sel) if (PE.shapes[i]) translateShape(PE.shapes[i], ddx, ddy);
      d.ax = x; d.ay = y;
      peDraw(); return;
    }
    if (d.mode === 'scale') {
      const b = d.box;
      const ox = d.dir[0] > 0 ? b.x : b.x + b.w;
      const oy = d.dir[1] > 0 ? b.y : b.y + b.h;
      let sx = d.dir[0] === 0 ? 1 : (x - ox) / ((d.dir[0] > 0 ? b.x + b.w : b.x) - ox);
      let sy = d.dir[1] === 0 ? 1 : (y - oy) / ((d.dir[1] > 0 ? b.y + b.h : b.y) - oy);
      if (ev.shiftKey && d.dir[0] && d.dir[1]) { const m = Math.max(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx) * m; sy = Math.sign(sy) * m; }
      sx = clamp(sx || 1, -20, 20); sy = clamp(sy || 1, -20, 20);
      PE.sel.forEach((idx, k) => {
        PE.shapes[idx] = vClone(d.orig[k]);
        scaleShapeAbout(PE.shapes[idx], ox, oy, sx, sy);
      });
      peDraw(); return;
    }
    if (d.mode === 'marquee') {
      d.bx = x; d.by = y; peDraw(); return;
    }
    if (d.mode === 'create') {
      const x0 = Math.min(d.ax, x), y0 = Math.min(d.ay, y);
      let w = Math.abs(x - d.ax), h = Math.abs(y - d.ay);
      if (ev.shiftKey) { const m = Math.max(w, h); w = m; h = m; }
      let s;
      if (PE.tool === 'rect') s = vRect(x0, y0, w, h, 0);
      else if (PE.tool === 'ellipse') s = vEllipse(x0 + w / 2, y0 + h / 2, w / 2, h / 2);
      else if (PE.tool === 'line') s = vLine(d.ax, d.ay, x, y);
      else {
        const pts = parseInt($('pePolyPoints').value, 10) || 5;
        s = vPoly(d.ax, d.ay, Math.hypot(x - d.ax, y - d.ay), pts,
          PE.tool === 'star' ? (parseFloat($('peStarInner').value) || 0.45) : 1,
          Math.atan2(y - d.ay, x - d.ax) + Math.PI / 2);
      }
      d.preview = peStyleFor(s);
      peDraw(); return;
    }
  });

  c.addEventListener('pointerup', (ev) => {
    const d = PE.drag; PE.drag = null;
    if (!d) return;
    if (d.mode === 'create' && d.preview) {
      const b = shapeBBox(d.preview);
      if (b.w > 0.01 || b.h > 0.01) peAdd(d.preview); else peDraw();
      return;
    }
    if (d.mode === 'marquee') {
      const x0 = Math.min(d.ax, d.bx), x1 = Math.max(d.ax, d.bx);
      const y0 = Math.min(d.ay, d.by), y1 = Math.max(d.ay, d.by);
      if (Math.abs(x1 - x0) > 0.01) {
        PE.shapes.forEach((s, i) => {
          const b = shapeBBox(s);
          if (b.x >= x0 && b.y >= y0 && b.x + b.w <= x1 && b.y + b.h <= y1 && PE.sel.indexOf(i) < 0) PE.sel.push(i);
        });
      }
      peBuildLayers(); peSyncStylePanel();
    }
    peDraw();
  });

  c.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const r = c.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const [ux, uy] = peToUnit(mx, my);
    PE.view.zoom = clamp(PE.view.zoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12), 20, 4000);
    PE.view.x = mx - ux * PE.view.zoom;
    PE.view.y = my - uy * PE.view.zoom;
    peDraw();
  }, { passive: false });
}

/* ---------------- editing commands ---------------- */

function peSelected() { return PE.sel.map(i => PE.shapes[i]).filter(Boolean); }

function peDeleteSel() {
  if (!PE.sel.length) return;
  peSnapshot();
  PE.shapes = PE.shapes.filter((_, i) => PE.sel.indexOf(i) < 0);
  PE.sel = [];
  peBuildLayers(); peDraw();
}

function peDuplicateSel() {
  if (!PE.sel.length) return;
  peSnapshot();
  const copies = peSelected().map(s => { const c = vClone(s); translateShape(c, 0.06, 0.06); return c; });
  PE.shapes = PE.shapes.concat(copies);
  PE.sel = copies.map((_, k) => PE.shapes.length - copies.length + k);
  peBuildLayers(); peDraw();
}

function peArrange(where) {
  if (!PE.sel.length) return;
  peSnapshot();
  const picked = peSelected();
  const rest = PE.shapes.filter((_, i) => PE.sel.indexOf(i) < 0);
  if (where === 'front') PE.shapes = rest.concat(picked);
  else if (where === 'back') PE.shapes = picked.concat(rest);
  else {
    const i = PE.sel[0];
    const j = clamp(where === 'forward' ? i + 1 : i - 1, 0, PE.shapes.length - 1);
    const arr = PE.shapes.slice();
    const [m] = arr.splice(i, 1); arr.splice(j, 0, m);
    PE.shapes = arr; PE.sel = [j];
    peBuildLayers(); peDraw(); return;
  }
  PE.sel = where === 'front'
    ? picked.map((_, k) => rest.length + k)
    : picked.map((_, k) => k);
  peBuildLayers(); peDraw();
}

function peAlign(how) {
  const sel = peSelected();
  if (sel.length < 1) return;
  peSnapshot();
  const b = sel.length > 1 ? shapesBBox(sel) : { x: -PE.meta.size / 2, y: -PE.meta.size / 2, w: PE.meta.size, h: PE.meta.size };
  for (const s of sel) {
    const sb = shapeBBox(s);
    let dx = 0, dy = 0;
    if (how === 'left') dx = b.x - sb.x;
    if (how === 'hcenter') dx = (b.x + b.w / 2) - (sb.x + sb.w / 2);
    if (how === 'right') dx = (b.x + b.w) - (sb.x + sb.w);
    if (how === 'top') dy = b.y - sb.y;
    if (how === 'vcenter') dy = (b.y + b.h / 2) - (sb.y + sb.h / 2);
    if (how === 'bottom') dy = (b.y + b.h) - (sb.y + sb.h);
    translateShape(s, dx, dy);
  }
  peDraw();
}

function peFlip(axis) {
  const sel = peSelected(); if (!sel.length) return;
  peSnapshot();
  const b = shapesBBox(sel);
  const ox = b.x + b.w / 2, oy = b.y + b.h / 2;
  for (const s of sel) scaleShapeAbout(s, ox, oy, axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1);
  peDraw();
}

function peRotateSel(deg) {
  const sel = peSelected(); if (!sel.length) return;
  peSnapshot();
  const b = shapesBBox(sel);
  const ox = b.x + b.w / 2, oy = b.y + b.h / 2;
  for (const s of sel) rotateShapeAbout(s, ox, oy, deg * Math.PI / 180);
  peDraw();
}

/** Combine selected shapes into one even-odd path, which cuts holes. */
function peCompound() {
  const sel = peSelected();
  if (sel.length < 2) { peToast('Select two or more shapes to punch a hole.'); return; }
  peSnapshot();
  const first = sel[0];
  const comp = vShape('compound', {
    children: sel.map(s => shapeToPath(s)),
    fill: vClone(first.fill), stroke: vClone(first.stroke), opacity: first.opacity
  });
  PE.shapes = PE.shapes.filter((_, i) => PE.sel.indexOf(i) < 0);
  PE.shapes.push(comp);
  PE.sel = [PE.shapes.length - 1];
  peBuildLayers(); peDraw();
}

function peReleaseCompound() {
  const sel = peSelected();
  const comps = sel.filter(s => s.type === 'compound');
  if (!comps.length) return;
  peSnapshot();
  for (const c of comps) {
    const at = PE.shapes.indexOf(c);
    PE.shapes.splice(at, 1, ...c.children.map(ch => {
      ch.fill = vClone(c.fill); ch.stroke = vClone(c.stroke); return ch;
    }));
  }
  PE.sel = [];
  peBuildLayers(); peDraw();
}

function peAddNodeToPath() {
  // split the longest segment of the selected path
  const s = peSelected()[0];
  if (!s || s.type !== 'path' || s.nodes.length < 2) return;
  peSnapshot();
  let bi = 0, bd = -1;
  const last = s.closed ? s.nodes.length : s.nodes.length - 1;
  for (let i = 0; i < last; i++) {
    const a = s.nodes[i], b = s.nodes[(i + 1) % s.nodes.length];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > bd) { bd = d; bi = i; }
  }
  const a = s.nodes[bi], b = s.nodes[(bi + 1) % s.nodes.length];
  s.nodes.splice(bi + 1, 0, vNode((a.x + b.x) / 2, (a.y + b.y) / 2));
  peDraw();
}

function peDeleteNode() {
  const h = PE.nodeSel;
  if (!h || !h.shape || h.shape.nodes.length <= 2) return;
  peSnapshot();
  h.shape.nodes.splice(h.node, 1);
  PE.nodeSel = null;
  peDraw();
}

/* ---------------- style panel ---------------- */

function peApplyStyleToSelection() {
  const sel = peSelected();
  if (!sel.length) return;
  peSnapshot();
  for (const s of sel) {
    s.fill = PE.style.fillOn ? vClone(PE.style.fill) : null;
    s.stroke = PE.style.strokeOn ? vClone(PE.style.stroke) : null;
  }
  peDraw();
}

function peSyncStylePanel() {
  const s = peSelected()[0];
  if (s) {
    if (s.fill) { PE.style.fill = vClone(s.fill); PE.style.fillOn = true; } else PE.style.fillOn = false;
    if (s.stroke) { PE.style.stroke = vClone(s.stroke); PE.style.strokeOn = true; } else PE.style.strokeOn = false;
  }
  $('peFillOn').checked = PE.style.fillOn;
  $('peStrokeOn').checked = PE.style.strokeOn;
  $('peFillKind').value = PE.style.fill.kind || 'solid';
  const solid = (PE.style.fill.kind || 'solid') === 'solid';
  $('peFillColor').value = solid ? peHexOf(PE.style.fill.color) : peHexOf((PE.style.fill.stops || [[0, '#ffffff']])[0][1]);
  $('peFillColor2').value = solid ? '#000000' : peHexOf((PE.style.fill.stops || [[0, '#fff'], [1, '#000']])[1][1]);
  $('peFillColor2').parentElement.style.display = solid ? 'none' : '';
  $('peGradAngle').parentElement.style.display = (PE.style.fill.kind === 'linear') ? '' : 'none';
  $('peStrokeColor').value = peHexOf(PE.style.stroke.color);
  $('peStrokeWidth').value = PE.style.stroke.width;
  $('peStrokeWidthLbl').textContent = (+PE.style.stroke.width).toFixed(3);
  $('peOpacity').value = s ? (s.opacity === undefined ? 1 : s.opacity) : 1;
  $('peOpacityLbl').textContent = (+$('peOpacity').value).toFixed(2);
}

function peHexOf(c) {
  if (!c) return '#000000';
  if (c[0] === '#' && c.length === 7) return c;
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
  if (m) return rgbToHex([+m[1], +m[2], +m[3]]);
  return '#000000';
}

/* ---------------- layers ---------------- */

function peBuildLayers() {
  const box = $('peLayers');
  box.innerHTML = '';
  for (let i = PE.shapes.length - 1; i >= 0; i--) {
    const s = PE.shapes[i];
    const row = document.createElement('div');
    row.className = 'pelayer' + (PE.sel.indexOf(i) >= 0 ? ' sel' : '');
    const sw = document.createElement('i');
    sw.className = 'peswatch';
    sw.style.background = s.fill ? (s.fill.kind === 'solid' || !s.fill.kind ? s.fill.color
      : (s.fill.stops && s.fill.stops[0] ? s.fill.stops[0][1] : '#888')) : 'transparent';
    if (!s.fill && s.stroke) sw.style.border = '2px solid ' + s.stroke.color;
    const name = document.createElement('span');
    name.textContent = s.name || (s.type === 'compound' ? 'compound path' : s.type);
    const eye = document.createElement('button');
    eye.className = 'peeye';
    eye.innerHTML = iconSvg(s.hidden ? 'eyeOff' : 'eye');
    eye.setAttribute('aria-label', s.hidden ? 'Show this shape' : 'Hide this shape');
    eye.title = 'Show / hide';
    eye.addEventListener('click', (e) => { e.stopPropagation(); s.hidden = !s.hidden; peBuildLayers(); peDraw(); });
    row.append(sw, name, eye);
    row.addEventListener('click', () => {
      PE.sel = [i]; peBuildLayers(); peDraw(); peSyncStylePanel();
    });
    box.appendChild(row);
  }
  $('peCount').textContent = PE.shapes.length + ' shape' + (PE.shapes.length === 1 ? '' : 's');
}

/* ---------------- metadata & saving ---------------- */

function peSyncMeta() {
  $('peName').value = PE.meta.label;
  $('peSize').value = PE.meta.size;
  $('peSizeLbl').textContent = (+PE.meta.size).toFixed(1);
  $('peBlocks').checked = !!PE.meta.blocks;
  $('peUnder').checked = !!PE.meta.under;
  $('peSnap').checked = !!PE.meta.snap;
  $('peLightOn').checked = !!PE.meta.light;
  $('peLightRow').style.display = PE.meta.light ? '' : 'none';
  if (PE.meta.light) {
    $('peLightRange').value = PE.meta.light.range;
    $('peLightRangeLbl').textContent = PE.meta.light.range;
    $('peLightColor').value = PE.meta.light.color;
  }
}

function peReadMeta() {
  PE.meta.label = $('peName').value.trim() || 'New Prop';
  PE.meta.size = clamp(parseFloat($('peSize').value) || 1, 0.3, 16);
  PE.meta.blocks = $('peBlocks').checked;
  PE.meta.under = $('peUnder').checked;
  PE.meta.snap = $('peSnap').checked;
  PE.meta.light = $('peLightOn').checked
    ? { range: parseFloat($('peLightRange').value) || 4, color: $('peLightColor').value, intensity: 0.9 }
    : null;
}

function peSaveProp() {
  peReadMeta();
  if (!PE.shapes.length) { peToast('Nothing to save — draw something first.'); return; }
  const def = customPropDef({
    key: PE.meta.key || undefined,
    label: PE.meta.label, size: PE.meta.size, blocks: PE.meta.blocks,
    under: PE.meta.under, snap: PE.meta.snap, light: PE.meta.light,
    shapes: vClone(PE.shapes)
  });
  PE.meta.key = def.key;
  registerCustomProp(def);
  const stored = saveCustomProps();
  // make it the active prop so it can be placed immediately
  state.propCat = 'custom';
  state.prop = def.key;
  buildPropPanel();
  peToast('Saved "' + def.label + '"' + (stored ? '' : ' (this browser blocks local storage, so it will not persist)'));
  peRefreshLibrary();
}

function peToast(msg) {
  const el = $('peToast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(peToast._t);
  peToast._t = setTimeout(() => el.classList.remove('show'), 3000);
}

function peRefreshLibrary() {
  const box = $('peLibrary');
  box.innerHTML = '';
  const keys = Object.keys(CUSTOM_PROPS);
  if (!keys.length) {
    box.innerHTML = '<p class="hint" style="margin:0">Nothing saved yet.</p>';
    return;
  }
  for (const k of keys) {
    const d = CUSTOM_PROPS[k];
    const cell = document.createElement('div');
    cell.className = 'pelibcell';
    const c = makeCanvas(54, 54);
    const cx = c.getContext('2d');
    cx.fillStyle = '#2a2f3c'; cx.fillRect(0, 0, 54, 54);
    cx.save(); cx.translate(27, 27);
    try { makeShapeDrawFn(d.shapes)(cx, 46 / Math.max(1, d.size)); } catch (e) { }
    cx.restore();
    const lbl = document.createElement('span');
    lbl.textContent = d.label;
    const del = document.createElement('button');
    del.className = 'peeye'; del.innerHTML = iconSvg('trash');
    del.title = 'Delete'; del.setAttribute('aria-label', 'Delete this prop');
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('Delete "' + d.label + '"? Maps already using it will lose it.')) return;
      deleteCustomProp(k); peRefreshLibrary(); buildPropPanel();
    });
    cell.append(c, lbl, del);
    cell.addEventListener('click', () => peOpen(k));
    box.appendChild(cell);
  }
}

/* ---------------- keyboard ---------------- */

const PE_TOOL_KEYS = {
  v: 'select', a: 'node', p: 'pen', m: 'rect', l: 'ellipse',
  n: 'poly', s: 'star', '\\': 'line', h: 'hand'
};

window.addEventListener('keydown', (ev) => {
  if (!PE.open) return;
  const tag = (ev.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  const k = ev.key.toLowerCase();

  if ((ev.metaKey || ev.ctrlKey) && k === 'z') { ev.preventDefault(); ev.shiftKey ? peRedo() : peUndo(); return; }
  if ((ev.metaKey || ev.ctrlKey) && k === 'd') { ev.preventDefault(); peDuplicateSel(); return; }
  if ((ev.metaKey || ev.ctrlKey) && k === 'a') {
    ev.preventDefault(); PE.sel = PE.shapes.map((_, i) => i); peBuildLayers(); peDraw(); return;
  }
  if (ev.metaKey || ev.ctrlKey) return;

  if (k === 'escape') {
    ev.preventDefault();
    if (PE.pen) { peSnapshot(); peFinishPen(); }
    else if (PE.sel.length) { PE.sel = []; peBuildLayers(); peDraw(); }
    else peClose();
    return;
  }
  if (k === 'enter' && PE.pen) { ev.preventDefault(); peSnapshot(); peFinishPen(); return; }
  if (k === 'delete' || k === 'backspace') {
    ev.preventDefault();
    if (PE.tool === 'node' && PE.nodeSel) peDeleteNode(); else peDeleteSel();
    return;
  }
  if (PE_TOOL_KEYS[k]) { ev.preventDefault(); peSetTool(PE_TOOL_KEYS[k]); return; }
  if (k === 'f') { ev.preventDefault(); peFit(); return; }
  if (k === '[') { ev.preventDefault(); peArrange('backward'); return; }
  if (k === ']') { ev.preventDefault(); peArrange('forward'); return; }
});

/* ---------------- wiring ---------------- */

function peWire() {
  PE.canvas = $('peCanvas');
  PE.ctx = PE.canvas.getContext('2d');
  peBindCanvas();

  for (const b of document.querySelectorAll('#peTools button'))
    b.addEventListener('click', () => peSetTool(b.dataset.petool));

  $('peClose').addEventListener('click', peClose);
  $('peSave').addEventListener('click', peSaveProp);
  $('peFitBtn').addEventListener('click', peFit);
  $('peUndoBtn').addEventListener('click', peUndo);
  $('peRedoBtn').addEventListener('click', peRedo);
  $('peDup').addEventListener('click', peDuplicateSel);
  $('peDel').addEventListener('click', peDeleteSel);
  $('peCompoundBtn').addEventListener('click', peCompound);
  $('peReleaseBtn').addEventListener('click', peReleaseCompound);
  $('peAddNode').addEventListener('click', peAddNodeToPath);

  for (const b of document.querySelectorAll('[data-arrange]'))
    b.addEventListener('click', () => peArrange(b.dataset.arrange));
  for (const b of document.querySelectorAll('[data-align]'))
    b.addEventListener('click', () => peAlign(b.dataset.align));
  for (const b of document.querySelectorAll('[data-flip]'))
    b.addEventListener('click', () => peFlip(b.dataset.flip));
  for (const b of document.querySelectorAll('[data-rot]'))
    b.addEventListener('click', () => peRotateSel(parseFloat(b.dataset.rot)));

  // style
  const styleChanged = () => {
    PE.style.fillOn = $('peFillOn').checked;
    PE.style.strokeOn = $('peStrokeOn').checked;
    const kind = $('peFillKind').value;
    if (kind === 'solid') PE.style.fill = { kind: 'solid', color: $('peFillColor').value };
    else PE.style.fill = {
      kind, stops: [[0, $('peFillColor').value], [1, $('peFillColor2').value]],
      angle: (parseFloat($('peGradAngle').value) || 0) * Math.PI / 180,
      cx: 0.4, cy: 0.35, r: 0.6
    };
    PE.style.stroke = {
      color: $('peStrokeColor').value,
      width: parseFloat($('peStrokeWidth').value) || 0,
      cap: 'round', join: 'round', dash: 0
    };
    $('peFillColor2').parentElement.style.display = kind === 'solid' ? 'none' : '';
    $('peGradAngle').parentElement.style.display = kind === 'linear' ? '' : 'none';
    $('peStrokeWidthLbl').textContent = (+PE.style.stroke.width).toFixed(3);
    peApplyStyleToSelection();
  };
  for (const id of ['peFillOn', 'peStrokeOn', 'peFillKind', 'peFillColor', 'peFillColor2',
    'peGradAngle', 'peStrokeColor', 'peStrokeWidth'])
    $(id).addEventListener('input', styleChanged);

  $('peOpacity').addEventListener('input', () => {
    const v = clamp(parseFloat($('peOpacity').value), 0, 1);
    $('peOpacityLbl').textContent = v.toFixed(2);
    const sel = peSelected(); if (!sel.length) return;
    for (const s of sel) s.opacity = v;
    peDraw();
  });

  // swatch grid
  const sw = $('peSwatches');
  for (const col of PE_SWATCHES) {
    const b = document.createElement('button');
    b.className = 'peswatchbtn';
    b.style.background = col;
    b.title = col;
    b.addEventListener('click', (ev) => {
      if (ev.shiftKey) { $('peStrokeColor').value = peHexOf(col); }
      else { $('peFillColor').value = peHexOf(col); }
      styleChanged();
    });
    sw.appendChild(b);
  }

  // metadata
  for (const id of ['peName', 'peSize', 'peBlocks', 'peUnder', 'peSnap', 'peLightOn', 'peLightRange', 'peLightColor'])
    $(id).addEventListener('input', () => {
      peReadMeta();
      $('peSizeLbl').textContent = (+PE.meta.size).toFixed(1);
      $('peLightRow').style.display = PE.meta.light ? '' : 'none';
      if (PE.meta.light) $('peLightRangeLbl').textContent = PE.meta.light.range;
      peDraw();
    });

  $('peGrid').addEventListener('input', () => { PE.grid = $('peGrid').checked; peDraw(); });
  $('peSnapGrid').addEventListener('input', () => { PE.snapGrid = $('peSnapGrid').checked; });

  // templates
  const tsel = $('peTemplate');
  for (const t of PROP_TEMPLATES) {
    const o = document.createElement('option');
    o.value = t.id; o.textContent = t.label;
    tsel.appendChild(o);
  }
  $('peLoadTemplate').addEventListener('click', () => {
    const t = buildTemplate(tsel.value);
    peSnapshot();
    PE.shapes = t.shapes;
    PE.meta.size = t.size; PE.meta.under = t.under; PE.meta.blocks = t.blocks;
    if (tsel.value !== 'blank') PE.meta.label = t.label;
    PE.sel = [];
    peSyncMeta(); peBuildLayers(); peFit();
  });

  $('peNew').addEventListener('click', () => peOpen(null));

  // import / export packs
  $('peExport').addEventListener('click', () => {
    const list = Object.values(CUSTOM_PROPS);
    if (!list.length) { peToast('No custom props to export yet.'); return; }
    downloadText(JSON.stringify({ kind: 'battlemap-forge-props', version: 1, props: list }, null, 1),
      'custom-props.forgeprops.json');
  });
  $('peImport').addEventListener('click', () => $('pePackFile').click());
  $('pePackFile').addEventListener('change', (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const data = JSON.parse(fr.result);
        const list = data.props || (Array.isArray(data) ? data : null);
        if (!list) throw new Error('not a prop pack');
        const n = adoptCustomProps(list);
        peRefreshLibrary(); buildPropPanel();
        peToast('Imported ' + n + ' prop' + (n === 1 ? '' : 's') + '.');
      } catch (e) { peToast('Could not read that pack: ' + e.message); }
    };
    fr.readAsText(f);
    ev.target.value = '';
  });

  // ---- bring in artwork from other tools
  $('peImportSvg').addEventListener('click', () => $('peSvgFile').click());
  $('peSvgFile').addEventListener('change', (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        peReadMeta();
        const r = importSVG(fr.result, PE.meta.size);
        peSnapshot();
        PE.shapes = PE.shapes.concat(r.shapes);
        PE.sel = r.shapes.map((_, k) => PE.shapes.length - r.shapes.length + k);
        if (PE.meta.label === 'New Prop') {
          PE.meta.label = f.name.replace(/\.svg$/i, '').slice(0, 40) || 'Imported';
          peSyncMeta();
        }
        peBuildLayers(); peFit();
        peToast('Imported ' + r.count + ' shape' + (r.count === 1 ? '' : 's') +
          (r.warnings.length ? ' — ' + r.warnings.join('; ') : '') + '.');
      } catch (e) { peToast('Could not import: ' + e.message, 5000); }
    };
    fr.readAsText(f);
    ev.target.value = '';
  });

  $('peImportImg').addEventListener('click', () => $('peImgFile').click());
  $('peImgFile').addEventListener('change', (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      peToast('That image is over 2 MB. Shrink it first — it has to live in your browser storage.', 6000);
      ev.target.value = ''; return;
    }
    const fr = new FileReader();
    fr.onload = () => {
      peReadMeta();
      const def = customPropDef({
        label: f.name.replace(/\.(png|webp|jpe?g)$/i, '').slice(0, 40) || 'Imported',
        size: PE.meta.size, blocks: PE.meta.blocks, under: PE.meta.under,
        snap: PE.meta.snap, light: PE.meta.light,
        image: fr.result, shapes: []
      });
      registerCustomProp(def);
      const stored = saveCustomProps();
      state.propCat = 'custom'; state.prop = def.key;
      buildPropPanel(); peRefreshLibrary();
      peToast('Added "' + def.label + '" as a picture prop' +
        (stored ? '' : ' (not saved — this browser blocks local storage)') + '.', 5000);
    };
    fr.readAsDataURL(f);
    ev.target.value = '';
  });

  window.addEventListener('resize', () => { if (PE.open) peDraw(); });
  peRefreshLibrary();
  peSyncStylePanel();
}
