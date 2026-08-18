/* Battlemap Forge — user-authored props.
 *
 * A custom prop is data, not code: a shape list plus metadata. It registers
 * into the same PROPS table the built-ins use, so once made it behaves like
 * any other prop — placeable, rotatable, scalable, it blocks line of sight and
 * emits light in exports if you say it should.
 */
'use strict';

const CUSTOM_PROPS = {};                 // key -> definition data
const CUSTOM_STORE_KEY = 'battlemapforge.customprops.v1';

function customPropDef(o) {
  return Object.assign({
    key: 'custom_' + Math.random().toString(36).slice(2, 9),
    label: 'New Prop',
    size: 1,
    h: 0.5,               // height in grid units — drives shading, see js/shading.js
    blocks: false,
    under: false,
    snap: true,
    light: null,          // {range, color, intensity}
    image: null,          // data URL, for props imported as pictures
    shapes: []
  }, o || {});
}

const _customImages = {};

/** Draw function for a prop backed by a bitmap rather than shapes. */
function makeImageDrawFn(def) {
  let img = _customImages[def.key];
  if (!img || img.src !== def.image) {
    img = new Image();
    img.onload = () => {
      // the picture arrives after the first render, so redraw once it is here
      try { if (typeof state !== 'undefined' && state.map) refresh(false); } catch (e) { }
      try { buildPropPanel(); } catch (e) { }
    };
    img.src = def.image;
    _customImages[def.key] = img;
  }
  return function (ctx, u) {
    if (!img.complete || !img.naturalWidth) return;
    const ar = img.naturalWidth / img.naturalHeight;
    let w = def.size, h = def.size;
    if (ar >= 1) h = def.size / ar; else w = def.size * ar;
    ctx.drawImage(img, -w * u / 2, -h * u / 2, w * u, h * u);
  };
}

/** Register (or replace) a custom prop in the live PROPS table. */
function registerCustomProp(def) {
  CUSTOM_PROPS[def.key] = def;
  const draw = def.image ? makeImageDrawFn(def) : makeShapeDrawFn(def.shapes);
  const entry = {
    key: def.key, label: def.label, cat: 'custom', size: def.size,
    h: def.h === undefined ? 0.5 : def.h,
    blocks: !!def.blocks, under: !!def.under, snap: !!def.snap,
    rand: true, custom: true, draw
  };
  if (def.light) entry.light = def.light;

  const existing = PROPS[def.key];
  PROPS[def.key] = entry;
  // the shading pass caches a rasterised silhouette per prop, and this one has
  // just changed shape under it
  clearPropSprites();
  const i = PROP_LIST.findIndex(p => p.key === def.key);
  if (i >= 0) PROP_LIST[i] = entry; else PROP_LIST.push(entry);
  if (PROP_CATEGORIES.indexOf('custom') === -1) PROP_CATEGORIES.push('custom');
  return entry;
}

function deleteCustomProp(key) {
  delete CUSTOM_PROPS[key];
  delete PROPS[key];
  const i = PROP_LIST.findIndex(p => p.key === key);
  if (i >= 0) PROP_LIST.splice(i, 1);
  saveCustomProps();
}

function saveCustomProps() {
  try {
    localStorage.setItem(CUSTOM_STORE_KEY, JSON.stringify(Object.values(CUSTOM_PROPS)));
    return true;
  } catch (e) {
    return false;   // private browsing, quota, or file:// restrictions
  }
}

function loadCustomProps() {
  let raw = null;
  try { raw = localStorage.getItem(CUSTOM_STORE_KEY); } catch (e) { return 0; }
  if (!raw) return 0;
  try {
    const list = JSON.parse(raw);
    for (const d of list) registerCustomProp(customPropDef(d));
    return list.length;
  } catch (e) { return 0; }
}

/** Re-register any custom props carried inside a project file. */
function adoptCustomProps(list) {
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (const d of list) {
    if (!d || !d.key) continue;
    registerCustomProp(customPropDef(d));
    n++;
  }
  if (n) saveCustomProps();
  return n;
}

/* ---------------- starting points ---------------- */

const S_WOOD = '#6b4a2b', S_WOOD_L = '#8a6238', S_WOOD_D = '#4a3117';
const S_STONE = '#8b8578', S_STONE_D = '#5e594f';
const S_METAL = '#6b7280', S_GOLD = '#c9a227';
const S_CLOTH = '#7a2a2a', S_CLOTH_L = '#a03b38';
const OUT = 'rgba(0,0,0,0.55)';

const stroke = (color, width, opts) =>
  Object.assign({ color, width, cap: 'round', join: 'round', dash: 0 }, opts || {});

const PROP_TEMPLATES = [
  {
    id: 'blank', label: 'Blank', size: 1,
    build: () => []
  },
  {
    id: 'round_table', label: 'Round Table', size: 1.4,
    build: () => {
      const a = vEllipse(0, 0, 0.62, 0.62);
      a.fill = { kind: 'radial', cx: 0.38, cy: 0.34, r: 0.62, stops: [[0, S_WOOD_L], [1, S_WOOD]] };
      a.stroke = stroke(OUT, 0.035);
      const b = vEllipse(0, 0, 0.5, 0.5);
      b.fill = { kind: 'solid', color: S_WOOD_L };
      b.stroke = stroke('rgba(0,0,0,0.2)', 0.02);
      return [a, b];
    }
  },
  {
    id: 'crate', label: 'Crate', size: 1,
    build: () => {
      const r = vRect(-0.36, -0.36, 0.72, 0.72, 0.04);
      r.fill = { kind: 'linear', angle: 1.0, stops: [[0, S_WOOD_L], [1, S_WOOD]] };
      r.stroke = stroke(OUT, 0.035);
      const d1 = vLine(-0.36, -0.36, 0.36, 0.36); d1.stroke = stroke('rgba(0,0,0,0.35)', 0.03);
      const d2 = vLine(0.36, -0.36, -0.36, 0.36); d2.stroke = stroke('rgba(0,0,0,0.35)', 0.03);
      return [r, d1, d2];
    }
  },
  {
    id: 'barrel', label: 'Barrel', size: 0.9,
    build: () => {
      const o = vEllipse(0, 0, 0.36, 0.36);
      o.fill = { kind: 'radial', cx: 0.36, cy: 0.32, r: 0.6, stops: [[0, S_WOOD_L], [1, S_WOOD_D]] };
      o.stroke = stroke(OUT, 0.035);
      const ring = vEllipse(0, 0, 0.29, 0.29);
      ring.fill = null; ring.stroke = stroke(S_METAL, 0.045);
      const top = vEllipse(0, 0, 0.16, 0.16);
      top.fill = { kind: 'solid', color: S_WOOD_L };
      top.stroke = stroke('rgba(0,0,0,0.3)', 0.02);
      return [o, ring, top];
    }
  },
  {
    id: 'rug', label: 'Rug', size: 2.4, under: true,
    build: () => {
      const base = vRect(-1.1, -0.75, 2.2, 1.5, 0.03);
      base.fill = { kind: 'solid', color: S_CLOTH };
      base.stroke = stroke('rgba(0,0,0,0.4)', 0.035);
      const border = vRect(-0.98, -0.63, 1.96, 1.26, 0);
      border.fill = null; border.stroke = stroke(S_GOLD, 0.03);
      const inner = vRect(-0.84, -0.49, 1.68, 0.98, 0);
      inner.fill = { kind: 'solid', color: S_CLOTH_L };
      inner.stroke = stroke(S_GOLD, 0.02);
      const star = vPoly(0, 0, 0.34, 8, 0.45, 0);
      star.fill = { kind: 'solid', color: S_GOLD };
      star.stroke = stroke('rgba(0,0,0,0.3)', 0.018);
      return [base, border, inner, star];
    }
  },
  {
    id: 'plinth', label: 'Statue Plinth', size: 1.2, blocks: true,
    build: () => {
      const b = vRect(-0.44, -0.44, 0.88, 0.88, 0.04);
      b.fill = { kind: 'solid', color: S_STONE_D };
      b.stroke = stroke('rgba(0,0,0,0.55)', 0.04);
      const t = vEllipse(0, 0, 0.32, 0.32);
      t.fill = { kind: 'radial', cx: 0.35, cy: 0.32, r: 0.6, stops: [[0, '#ded8cc'], [1, S_STONE]] };
      t.stroke = stroke('rgba(0,0,0,0.35)', 0.025);
      return [b, t];
    }
  },
  {
    id: 'banner', label: 'Banner', size: 1, under: true,
    build: () => {
      const p = vPath([
        vNode(-0.25, -0.45), vNode(0.25, -0.45),
        vNode(0.25, 0.3), vNode(0, 0.45), vNode(-0.25, 0.3)
      ], true);
      p.fill = { kind: 'linear', angle: Math.PI / 2, stops: [[0, '#6b2230'], [1, '#8c2f33']] };
      p.stroke = stroke('rgba(0,0,0,0.45)', 0.03);
      const em = vPoly(0, -0.08, 0.13, 5, 0.45, 0);
      em.fill = { kind: 'solid', color: S_GOLD };
      return [p, em];
    }
  },
  {
    id: 'pool', label: 'Water Pool', size: 2, under: true,
    build: () => {
      const rim = vEllipse(0, 0, 0.92, 0.72);
      rim.fill = { kind: 'solid', color: S_STONE_D };
      rim.stroke = stroke('rgba(0,0,0,0.5)', 0.04);
      const w = vEllipse(0, 0, 0.78, 0.58);
      w.fill = { kind: 'radial', cx: 0.4, cy: 0.35, r: 0.7, stops: [[0, '#4a8fa8'], [1, '#1b4a5c']] };
      w.stroke = stroke('rgba(0,0,0,0.3)', 0.02);
      const gl = vEllipse(-0.24, -0.18, 0.2, 0.12);
      gl.fill = { kind: 'solid', color: 'rgba(255,255,255,0.18)' };
      return [rim, w, gl];
    }
  }
];

function buildTemplate(id) {
  const t = PROP_TEMPLATES.find(x => x.id === id) || PROP_TEMPLATES[0];
  return {
    shapes: t.build(),
    size: t.size || 1,
    under: !!t.under,
    blocks: !!t.blocks,
    label: t.label === 'Blank' ? 'New Prop' : t.label
  };
}
