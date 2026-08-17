/* Battlemap Forge — SVG import.
 *
 * Converts an SVG (Illustrator, Inkscape, Affinity, Figma) into the editor's
 * own shape model, so imported artwork stays fully editable rather than being
 * pasted in as a picture. Geometry is baked through the element transforms and
 * normalised into unit space, centred on the prop's origin.
 */
'use strict';

/* ---------------- transforms ---------------- */

const M_ID = [1, 0, 0, 1, 0, 0];   // a b c d e f

function mMul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}
const mApply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function parseTransform(str) {
  let m = M_ID.slice();
  if (!str) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let t;
  while ((t = re.exec(str))) {
    const a = t[2].split(/[\s,]+/).filter(v => v !== '').map(Number);
    let n = M_ID.slice();
    switch (t[1]) {
      case 'matrix': if (a.length >= 6) n = a.slice(0, 6); break;
      case 'translate': n = [1, 0, 0, 1, a[0] || 0, a[1] || 0]; break;
      case 'scale': n = [a[0] || 1, 0, 0, a.length > 1 ? a[1] : (a[0] || 1), 0, 0]; break;
      case 'rotate': {
        const r = (a[0] || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
        n = [c, s, -s, c, 0, 0];
        if (a.length >= 3) n = mMul([1, 0, 0, 1, a[1], a[2]], mMul(n, [1, 0, 0, 1, -a[1], -a[2]]));
        break;
      }
      case 'skewX': n = [1, 0, Math.tan((a[0] || 0) * Math.PI / 180), 1, 0, 0]; break;
      case 'skewY': n = [1, Math.tan((a[0] || 0) * Math.PI / 180), 0, 1, 0, 0]; break;
    }
    m = mMul(m, n);
  }
  return m;
}

/* ---------------- path data ---------------- */

function tokenizePath(d) {
  const out = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let t;
  while ((t = re.exec(d))) out.push(t[1] !== undefined ? t[1] : parseFloat(t[2]));
  return out;
}

/** Approximate an elliptical arc with cubic segments. */
function arcToCubics(x0, y0, rx, ry, rot, large, sweep, x, y) {
  if (!rx || !ry) return [[x0, y0, x, y, x, y]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = rot * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x0 - x) / 2, dy = (y0 - y) / 2;
  const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
  let lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const sign = large === sweep ? -1 : 1;
  let num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const co = sign * Math.sqrt(Math.max(0, num) / (den || 1));
  const cx1 = co * rx * y1 / ry, cy1 = -co * ry * x1 / rx;
  const cx = cp * cx1 - sp * cy1 + (x0 + x) / 2;
  const cy = sp * cx1 + cp * cy1 + (y0 + y) / 2;
  const ang = (ux, uy, vx, vy) => {
    const d = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy)) || 1;
    let c = clamp((ux * vx + uy * vy) / d, -1, 1);
    return (ux * vy - uy * vx < 0 ? -1 : 1) * Math.acos(c);
  };
  const th0 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dth = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dth > 0) dth -= Math.PI * 2;
  if (sweep && dth < 0) dth += Math.PI * 2;

  const segs = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2)));
  const out = [];
  const step = dth / segs;
  const k = 4 / 3 * Math.tan(step / 4);
  let th = th0;
  let px = x0, py = y0;
  for (let i = 0; i < segs; i++) {
    const th1 = th + step;
    const pt = (t) => {
      const ct = Math.cos(t), st = Math.sin(t);
      return [cp * rx * ct - sp * ry * st + cx, sp * rx * ct + cp * ry * st + cy];
    };
    const dpt = (t) => {
      const ct = Math.cos(t), st = Math.sin(t);
      return [-cp * rx * st - sp * ry * ct, -sp * rx * st + cp * ry * ct];
    };
    const [ex, ey] = pt(th1);
    const [d0x, d0y] = dpt(th), [d1x, d1y] = dpt(th1);
    out.push([px + k * d0x, py + k * d0y, ex - k * d1x, ey - k * d1y, ex, ey]);
    px = ex; py = ey; th = th1;
  }
  return out;
}

/** Path data -> one or more subpaths of {nodes, closed}. */
function pathDataToSubpaths(d) {
  const tk = tokenizePath(d);
  const subs = [];
  let cur = null, cmd = '', i = 0;
  let x = 0, y = 0, sx = 0, sy = 0;
  let lastC = null, lastQ = null;

  const startSub = () => { cur = { nodes: [], closed: false }; subs.push(cur); };
  const addNode = (nx, ny) => { cur.nodes.push(vNode(nx, ny)); };
  const setOut = (cx, cy) => {
    const n = cur.nodes[cur.nodes.length - 1];
    if (n) n.hOut = [cx - n.x, cy - n.y];
  };
  const setIn = (cx, cy) => {
    const n = cur.nodes[cur.nodes.length - 1];
    if (n) n.hIn = [cx - n.x, cy - n.y];
  };

  while (i < tk.length) {
    if (typeof tk[i] === 'string') { cmd = tk[i++]; }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const num = () => tk[i++];

    if (C === 'M') {
      const nx = (rel ? x : 0) + num(), ny = (rel ? y : 0) + num();
      x = nx; y = ny; sx = x; sy = y;
      startSub(); addNode(x, y);
      cmd = rel ? 'l' : 'L';
      lastC = lastQ = null;
    } else if (C === 'L') {
      const nx = (rel ? x : 0) + num(), ny = (rel ? y : 0) + num();
      x = nx; y = ny; if (!cur) startSub(); addNode(x, y); lastC = lastQ = null;
    } else if (C === 'H') {
      x = (rel ? x : 0) + num(); if (!cur) startSub(); addNode(x, y); lastC = lastQ = null;
    } else if (C === 'V') {
      y = (rel ? y : 0) + num(); if (!cur) startSub(); addNode(x, y); lastC = lastQ = null;
    } else if (C === 'C' || C === 'S') {
      let c1x, c1y;
      if (C === 'C') { c1x = (rel ? x : 0) + num(); c1y = (rel ? y : 0) + num(); }
      else { c1x = lastC ? 2 * x - lastC[0] : x; c1y = lastC ? 2 * y - lastC[1] : y; }
      const c2x = (rel ? x : 0) + num(), c2y = (rel ? y : 0) + num();
      const nx = (rel ? x : 0) + num(), ny = (rel ? y : 0) + num();
      if (!cur) startSub();
      setOut(c1x, c1y); addNode(nx, ny); setIn(c2x, c2y);
      lastC = [c2x, c2y]; lastQ = null; x = nx; y = ny;
    } else if (C === 'Q' || C === 'T') {
      let qx, qy;
      if (C === 'Q') { qx = (rel ? x : 0) + num(); qy = (rel ? y : 0) + num(); }
      else { qx = lastQ ? 2 * x - lastQ[0] : x; qy = lastQ ? 2 * y - lastQ[1] : y; }
      const nx = (rel ? x : 0) + num(), ny = (rel ? y : 0) + num();
      if (!cur) startSub();
      // quadratic -> cubic
      setOut(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y));
      addNode(nx, ny);
      setIn(nx + (2 / 3) * (qx - nx), ny + (2 / 3) * (qy - ny));
      lastQ = [qx, qy]; lastC = null; x = nx; y = ny;
    } else if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), la = num(), sw = num();
      const nx = (rel ? x : 0) + num(), ny = (rel ? y : 0) + num();
      if (!cur) startSub();
      for (const [c1x, c1y, c2x, c2y, ex, ey] of arcToCubics(x, y, rx, ry, rot, la, sw, nx, ny)) {
        setOut(c1x, c1y); addNode(ex, ey); setIn(c2x, c2y);
      }
      x = nx; y = ny; lastC = lastQ = null;
    } else if (C === 'Z') {
      if (cur) {
        cur.closed = true;
        // a trailing node on top of the start is redundant once closed
        const f = cur.nodes[0], l = cur.nodes[cur.nodes.length - 1];
        if (cur.nodes.length > 1 && Math.hypot(f.x - l.x, f.y - l.y) < 1e-6) {
          f.hIn = l.hIn; cur.nodes.pop();
        }
      }
      x = sx; y = sy; cur = null; lastC = lastQ = null;
    } else { i++; }                       // unknown command: skip a token
  }
  return subs.filter(s => s.nodes.length > 1);
}

/* ---------------- styling ---------------- */

function svgStyle(el, inherited) {
  const style = Object.assign({}, inherited);
  const inline = {};
  const sa = el.getAttribute('style');
  if (sa) for (const part of sa.split(';')) {
    const [k, v] = part.split(':');
    if (k && v) inline[k.trim()] = v.trim();
  }
  for (const k of ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity',
    'stroke-opacity', 'stroke-linecap', 'stroke-linejoin']) {
    const v = inline[k] !== undefined ? inline[k] : el.getAttribute(k);
    if (v !== null && v !== undefined && v !== '') style[k] = v;
  }
  return style;
}

function svgPaint(col) {
  if (!col || col === 'none' || col === 'transparent') return null;
  if (/^url\(/.test(col)) return '#888888';     // gradients aren't resolved
  return col;
}

function applyStyle(shape, style, scale) {
  const f = svgPaint(style.fill === undefined ? '#000000' : style.fill);
  shape.fill = f ? { kind: 'solid', color: f } : null;
  const sc = svgPaint(style.stroke);
  if (sc) {
    const w = parseFloat(style['stroke-width']);
    shape.stroke = {
      color: sc,
      width: Math.max(0.004, (isNaN(w) ? 1 : w) * scale),
      cap: style['stroke-linecap'] || 'butt',
      join: style['stroke-linejoin'] || 'miter',
      dash: 0
    };
  } else shape.stroke = null;
  const o = parseFloat(style.opacity);
  shape.opacity = isNaN(o) ? 1 : clamp(o, 0, 1);
  return shape;
}

/* ---------------- element walk ---------------- */

function svgElementShapes(el, mat, style, out) {
  const tag = el.tagName.toLowerCase();
  const m = mMul(mat, parseTransform(el.getAttribute('transform')));
  const st = svgStyle(el, style);
  const num = (a, d) => { const v = parseFloat(el.getAttribute(a)); return isNaN(v) ? (d || 0) : v; };

  if (tag === 'g' || tag === 'svg' || tag === 'a') {
    for (const c of el.children) svgElementShapes(c, m, st, out);
    return out;
  }
  if (el.getAttribute('display') === 'none') return out;

  let subs = null;
  if (tag === 'path') subs = pathDataToSubpaths(el.getAttribute('d') || '');
  else if (tag === 'rect') {
    const x = num('x'), y = num('y'), w = num('width'), h = num('height');
    const rx = num('rx', 0) || num('ry', 0);
    if (w <= 0 || h <= 0) return out;
    subs = [shapeToNodes(vRect(x, y, w, h, rx))];
  } else if (tag === 'circle') {
    const r = num('r'); if (r <= 0) return out;
    subs = [shapeToNodes(vEllipse(num('cx'), num('cy'), r, r))];
  } else if (tag === 'ellipse') {
    const rx = num('rx'), ry = num('ry'); if (rx <= 0 || ry <= 0) return out;
    subs = [shapeToNodes(vEllipse(num('cx'), num('cy'), rx, ry))];
  } else if (tag === 'line') {
    subs = [{ nodes: [vNode(num('x1'), num('y1')), vNode(num('x2'), num('y2'))], closed: false }];
  } else if (tag === 'polyline' || tag === 'polygon') {
    const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
    const nodes = [];
    for (let i = 0; i + 1 < pts.length; i += 2) nodes.push(vNode(pts[i], pts[i + 1]));
    if (nodes.length < 2) return out;
    subs = [{ nodes, closed: tag === 'polygon' }];
  } else return out;

  // bake the transform into the geometry
  const sc = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  // SVG defaults fill to black, which is meaningless for an open stroke
  const st2 = (tag === 'line' || tag === 'polyline') && st.fill === undefined
    ? Object.assign({}, st, { fill: 'none' }) : st;
  for (const sub of subs) {
    const p = vPath(sub.nodes, sub.closed);
    mapShapePoints(p, (px, py) => mApply(m, px, py));
    applyStyle(p, st2, sc);
    p.name = tag;
    out.push(p);
  }
  return out;
}

/**
 * Parse SVG text into shapes normalised to `size` grid squares, centred.
 * Returns { shapes, count, warnings }.
 */
function importSVG(text, size) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('that file is not valid SVG');
  const svg = doc.documentElement;
  if (!svg || svg.tagName.toLowerCase() !== 'svg') throw new Error('no <svg> root element');

  const warnings = [];
  if (doc.querySelector('text')) warnings.push('text was skipped — convert it to outlines first');
  if (doc.querySelector('image')) warnings.push('embedded images were skipped');
  if (doc.querySelector('linearGradient, radialGradient')) warnings.push('gradients came in as flat grey');

  const shapes = svgElementShapes(svg, M_ID.slice(), {}, []);
  if (!shapes.length) throw new Error('no drawable shapes found');

  // normalise: fit the artwork into the requested footprint, centred on origin
  const b = shapesBBox(shapes);
  const span = Math.max(b.w, b.h) || 1;
  const k = (size || 1) / span;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  for (const s of shapes) {
    mapShapePoints(s, (x, y) => [(x - cx) * k, (y - cy) * k]);
    if (s.stroke) s.stroke.width = Math.max(0.004, s.stroke.width * k);
  }
  return { shapes, count: shapes.length, warnings };
}
