/* Battlemap Forge — vector document model.
 *
 * Shapes live in "unit space": 1 unit = 1 grid square, origin at the prop's
 * centre. The same code renders a shape in the editor and in the finished
 * prop, so what you draw is exactly what lands on the map. Stroke widths are
 * in grid units too, so a prop stays correct at any export resolution.
 */
'use strict';

/* ---------------- construction ---------------- */

function vNode(x, y, hIn, hOut) {
  return { x, y, hIn: hIn || [0, 0], hOut: hOut || [0, 0] };
}

function vShape(type, extra) {
  return Object.assign({
    type,
    fill: { kind: 'solid', color: '#8a6238' },
    stroke: null,
    opacity: 1,
    rotation: 0,
    name: ''
  }, extra || {});
}

function vPath(nodes, closed) {
  return vShape('path', { nodes: nodes || [], closed: !!closed });
}
function vRect(x, y, w, h, r) {
  return vShape('rect', { x, y, w, h, r: r || 0 });
}
function vEllipse(cx, cy, rx, ry) {
  return vShape('ellipse', { cx, cy, rx, ry });
}
function vPoly(cx, cy, r, points, inner, rot) {
  return vShape('poly', { cx, cy, r, points: points || 5, inner: inner === undefined ? 1 : inner, rot: rot || 0 });
}
function vLine(x1, y1, x2, y2) {
  return vShape('line', {
    x1, y1, x2, y2,
    fill: null,
    stroke: { color: '#2b2b33', width: 0.04, cap: 'round', join: 'round', dash: 0 }
  });
}

const vClone = (o) => JSON.parse(JSON.stringify(o));

/* ---------------- geometry ---------------- */

/** Every shape reduces to a node list, so the pen and direct-select tools only
    ever deal with one representation. */
function shapeToNodes(s) {
  if (s.type === 'path') return { nodes: vClone(s.nodes), closed: s.closed };
  if (s.type === 'line') {
    return { nodes: [vNode(s.x1, s.y1), vNode(s.x2, s.y2)], closed: false };
  }
  if (s.type === 'rect') {
    const { x, y, w, h, r } = s;
    if (!r) {
      return {
        nodes: [vNode(x, y), vNode(x + w, y), vNode(x + w, y + h), vNode(x, y + h)],
        closed: true
      };
    }
    const k = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2) * 0.5523;
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    return {
      nodes: [
        vNode(x + rr, y, [-k, 0], [0, 0]),
        vNode(x + w - rr, y, [0, 0], [k, 0]),
        vNode(x + w, y + rr, [0, -k], [0, 0]),
        vNode(x + w, y + h - rr, [0, 0], [0, k]),
        vNode(x + w - rr, y + h, [k, 0], [0, 0]),
        vNode(x + rr, y + h, [0, 0], [-k, 0]),
        vNode(x, y + h - rr, [0, k], [0, 0]),
        vNode(x, y + rr, [0, 0], [0, -k])
      ],
      closed: true
    };
  }
  if (s.type === 'ellipse') {
    const k = 0.5523;
    const { cx, cy, rx, ry } = s;
    return {
      nodes: [
        vNode(cx, cy - ry, [-rx * k, 0], [rx * k, 0]),
        vNode(cx + rx, cy, [0, -ry * k], [0, ry * k]),
        vNode(cx, cy + ry, [rx * k, 0], [-rx * k, 0]),
        vNode(cx - rx, cy, [0, ry * k], [0, -ry * k])
      ],
      closed: true
    };
  }
  if (s.type === 'poly') {
    const nodes = [];
    const n = Math.max(3, s.points | 0);
    const steps = s.inner < 1 ? n * 2 : n;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2 - Math.PI / 2 + (s.rot || 0);
      const rr = s.r * (s.inner < 1 && i % 2 ? s.inner : 1);
      nodes.push(vNode(s.cx + Math.cos(a) * rr, s.cy + Math.sin(a) * rr));
    }
    return { nodes, closed: true };
  }
  return { nodes: [], closed: false };
}

/** Rebuild a primitive as an editable path, preserving its look. */
function shapeToPath(s) {
  const { nodes, closed } = shapeToNodes(s);
  const p = vPath(nodes, closed);
  p.fill = vClone(s.fill); p.stroke = vClone(s.stroke);
  p.opacity = s.opacity; p.name = s.name;
  return p;
}

function nodesToPath2D(nodes, closed, path) {
  const P = path || new Path2D();
  if (!nodes.length) return P;
  P.moveTo(nodes[0].x, nodes[0].y);
  const last = closed ? nodes.length : nodes.length - 1;
  for (let i = 0; i < last; i++) {
    const a = nodes[i], b = nodes[(i + 1) % nodes.length];
    const c1x = a.x + (a.hOut ? a.hOut[0] : 0), c1y = a.y + (a.hOut ? a.hOut[1] : 0);
    const c2x = b.x + (b.hIn ? b.hIn[0] : 0), c2y = b.y + (b.hIn ? b.hIn[1] : 0);
    if (c1x === a.x && c1y === a.y && c2x === b.x && c2y === b.y) P.lineTo(b.x, b.y);
    else P.bezierCurveTo(c1x, c1y, c2x, c2y, b.x, b.y);
  }
  if (closed) P.closePath();
  return P;
}

function shapePath2D(s) {
  if (s.type === 'compound' && s.children) {
    const P = new Path2D();
    for (const c of s.children) {
      const { nodes, closed } = shapeToNodes(c);
      nodesToPath2D(nodes, closed, P);
    }
    return P;
  }
  const { nodes, closed } = shapeToNodes(s);
  return nodesToPath2D(nodes, closed);
}

/* ---------------- bounds ---------------- */

function cubicAt(p0, p1, p2, p3, t) {
  const m = 1 - t;
  return m * m * m * p0 + 3 * m * m * t * p1 + 3 * m * t * t * p2 + t * t * t * p3;
}

function nodesBBox(nodes, closed) {
  if (!nodes.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const put = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  const last = closed ? nodes.length : nodes.length - 1;
  put(nodes[0].x, nodes[0].y);
  for (let i = 0; i < last; i++) {
    const a = nodes[i], b = nodes[(i + 1) % nodes.length];
    const c1x = a.x + a.hOut[0], c1y = a.y + a.hOut[1];
    const c2x = b.x + b.hIn[0], c2y = b.y + b.hIn[1];
    for (let t = 0; t <= 1.0001; t += 0.0625) {
      put(cubicAt(a.x, c1x, c2x, b.x, t), cubicAt(a.y, c1y, c2y, b.y, t));
    }
    put(b.x, b.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function shapeBBox(s) {
  if (s.type === 'compound' && s.children) {
    let b = null;
    for (const c of s.children) b = unionBBox(b, shapeBBox(c));
    return b || { x: 0, y: 0, w: 0, h: 0 };
  }
  const { nodes, closed } = shapeToNodes(s);
  const bb = nodesBBox(nodes, closed);
  if (s.stroke && s.stroke.width) {
    const hw = s.stroke.width / 2;
    return { x: bb.x - hw, y: bb.y - hw, w: bb.w + hw * 2, h: bb.h + hw * 2 };
  }
  return bb;
}

function unionBBox(a, b) {
  if (!a) return b; if (!b) return a;
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w), y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function shapesBBox(shapes) {
  let b = null;
  for (const s of shapes) b = unionBBox(b, shapeBBox(s));
  return b || { x: -0.5, y: -0.5, w: 1, h: 1 };
}

/* ---------------- transforms (baked into geometry) ---------------- */

function mapShapePoints(s, fn) {
  if (s.type === 'compound' && s.children) { s.children.forEach(c => mapShapePoints(c, fn)); return s; }
  if (s.type === 'path') {
    for (const n of s.nodes) {
      const p = fn(n.x, n.y);
      const hi = fn(n.x + n.hIn[0], n.y + n.hIn[1]);
      const ho = fn(n.x + n.hOut[0], n.y + n.hOut[1]);
      n.x = p[0]; n.y = p[1];
      n.hIn = [hi[0] - p[0], hi[1] - p[1]];
      n.hOut = [ho[0] - p[0], ho[1] - p[1]];
    }
    return s;
  }
  // primitives: convert when the transform isn't something they can express
  const converted = shapeToPath(s);
  Object.keys(s).forEach(k => delete s[k]);
  Object.assign(s, converted);
  return mapShapePoints(s, fn);
}

function translateShape(s, dx, dy) {
  if (s.type === 'path' || s.type === 'compound') return mapShapePoints(s, (x, y) => [x + dx, y + dy]);
  if (s.type === 'rect') { s.x += dx; s.y += dy; return s; }
  if (s.type === 'ellipse') { s.cx += dx; s.cy += dy; return s; }
  if (s.type === 'poly') { s.cx += dx; s.cy += dy; return s; }
  if (s.type === 'line') { s.x1 += dx; s.x2 += dx; s.y1 += dy; s.y2 += dy; return s; }
  return s;
}

function scaleShapeAbout(s, ox, oy, sx, sy) {
  return mapShapePoints(s, (x, y) => [ox + (x - ox) * sx, oy + (y - oy) * sy]);
}

function rotateShapeAbout(s, ox, oy, ang) {
  const c = Math.cos(ang), si = Math.sin(ang);
  return mapShapePoints(s, (x, y) => {
    const dx = x - ox, dy = y - oy;
    return [ox + dx * c - dy * si, oy + dx * si + dy * c];
  });
}

/* ---------------- painting ---------------- */

function makePaint(ctx, paint, bbox) {
  if (!paint) return null;
  if (paint.kind === 'solid' || !paint.kind) return paint.color;
  const b = bbox || { x: -0.5, y: -0.5, w: 1, h: 1 };
  let g;
  if (paint.kind === 'radial') {
    const cx = b.x + b.w * (paint.cx === undefined ? 0.5 : paint.cx);
    const cy = b.y + b.h * (paint.cy === undefined ? 0.5 : paint.cy);
    const r = Math.max(b.w, b.h) * (paint.r === undefined ? 0.5 : paint.r);
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1e-4, r));
  } else {
    const a = paint.angle === undefined ? 0 : paint.angle;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const len = Math.max(b.w, b.h) / 2;
    g = ctx.createLinearGradient(
      cx - Math.cos(a) * len, cy - Math.sin(a) * len,
      cx + Math.cos(a) * len, cy + Math.sin(a) * len);
  }
  const stops = paint.stops && paint.stops.length ? paint.stops : [[0, '#ffffff'], [1, '#000000']];
  for (const [t, col] of stops) g.addColorStop(clamp(t, 0, 1), col);
  return g;
}

function drawShape(ctx, s) {
  if (s.hidden) return;
  const P = shapePath2D(s);
  const bb = shapeBBox(s);
  ctx.save();
  if (s.opacity !== undefined && s.opacity < 1) ctx.globalAlpha *= s.opacity;
  if (s.fill) {
    ctx.fillStyle = makePaint(ctx, s.fill, bb);
    ctx.fill(P, s.type === 'compound' ? 'evenodd' : 'nonzero');
  }
  if (s.stroke && s.stroke.width > 0) {
    ctx.strokeStyle = makePaint(ctx, s.stroke.paint || { kind: 'solid', color: s.stroke.color }, bb);
    ctx.lineWidth = s.stroke.width;
    ctx.lineCap = s.stroke.cap || 'butt';
    ctx.lineJoin = s.stroke.join || 'miter';
    if (s.stroke.dash) ctx.setLineDash([s.stroke.dash, s.stroke.dash * 1.2]);
    ctx.stroke(P);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawShapes(ctx, shapes) {
  for (const s of shapes) drawShape(ctx, s);
}

/** Wrap a shape list as a prop draw function: (ctx, u, rnd). */
function makeShapeDrawFn(shapes) {
  return function (ctx, u) {
    ctx.save();
    ctx.scale(u, u);
    drawShapes(ctx, shapes);
    ctx.restore();
  };
}

/* ---------------- hit testing ---------------- */

let _hitCanvas = null;
function hitCtx() {
  if (!_hitCanvas) _hitCanvas = document.createElement('canvas').getContext('2d');
  return _hitCanvas;
}

function shapeHit(s, x, y, tol) {
  const ctx = hitCtx();
  const P = shapePath2D(s);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (s.fill && ctx.isPointInPath(P, x, y, s.type === 'compound' ? 'evenodd' : 'nonzero')) return true;
  const w = (s.stroke && s.stroke.width) || 0;
  ctx.lineWidth = Math.max(w, tol || 0.05);
  return ctx.isPointInStroke(P, x, y);
}
