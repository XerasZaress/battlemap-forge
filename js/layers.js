/* Battlemap Forge — the layer stack.
 *
 * Everything the renderer draws used to happen in one fixed order welded into
 * compose(): floor, props, light, weather, grid, labels. That order is right
 * most of the time, which is why it survived this long, and wrong in exactly
 * the places people care about. A GM wants trap markers above the fog so they
 * stay legible, and the same markers gone entirely from the copy the players
 * see. Somebody tracing a bought map wants the grid under the furniture, not
 * over it. Somebody dressing a forest wants the undergrowth locked so it stops
 * grabbing the cursor while they place the ambush.
 *
 * So the order becomes data. `map.layers` is the stack, bottom of the drawing
 * first, and the renderer walks it instead of running a script. Inkarnate's
 * model, with its distinction between layers that *put something down* and
 * layers that *do something to what is already down*, is the one worth copying:
 * it is what lets a filter sit below the labels and above the floor.
 *
 * Two kinds of layer, and the difference decides what the controls can offer:
 *
 *   additive  — paints its own pixels onto a transparent sheet, which is then
 *               composited. Opacity and blend mode both mean what they mean in
 *               any image editor. Object layers and the grid.
 *   filter    — has no pixels of its own; it reads what is beneath and changes
 *               it. Baked lighting, the painted finish, the weather. Blend mode
 *               is meaningless for these, and opacity means strength — done by
 *               keeping the before image and cross-fading back to it, so half
 *               of a filter is genuinely half of it and not a ghost of the
 *               result laid over the original.
 *
 * The terrain is pinned to the bottom. It is the ground the map is standing on;
 * a stack that lets you put the floor above the furniture is not offering a
 * choice anybody wanted. It can still be hidden, which is a real thing to want
 * while checking prop coverage.
 */
'use strict';

const LAYER_KINDS = {
  terrain: {
    label: 'Terrain', icon: 'grid', filter: false, unique: true, pinned: true,
    blurb: 'The floor, walls, water and doors. Always the bottom of the stack.'
  },
  objects: {
    label: 'Objects', icon: 'chair', filter: false, unique: false, pinned: false,
    blurb: 'Props and labels. Add as many as you like.'
  },
  /* Baked light, the painted finish and the weather were three rows once. They
     are one now: each already has its strength under Appearance, so a per-row
     opacity said the same thing twice, and three rows nobody reorders
     separately is three rows of noise in a panel whose whole job is to be
     read at a glance. What the row is for is its *position* — everything below
     it is lit and weathered, everything above it is not. */
  effects: {
    label: 'Light & weather', icon: 'sparkles', filter: true, unique: true, pinned: false,
    blurb: 'Baked light, the painted finish and the weather. Anything above this row escapes all three. Set how strong they are under Appearance.'
  },
  grid: {
    label: 'Grid', icon: 'grid', filter: false, unique: true, pinned: false,
    blurb: 'The lattice. Move it under a layer to have that layer draw over it.'
  }
};

/* Which of the old per-effect rows collapse into the one that replaced them. */
const LEGACY_EFFECT_KINDS = { lighting: 1, finish: 1, atmos: 1 };

/* Tags for the leading edge of a layer row. Eight is enough to tell a stack
   apart at a glance and few enough to pick from without a colour wheel; they
   are the hues the rest of the interface already uses, at a saturation that
   survives being three pixels wide. */
const LAYER_COLORS = [
  { key: 'red', hex: '#d4574e' }, { key: 'amber', hex: '#d99a3c' },
  { key: 'gold', hex: '#c9a227' }, { key: 'green', hex: '#5c9e5c' },
  { key: 'teal', hex: '#3f9c9c' }, { key: 'blue', hex: '#4f86c6' },
  { key: 'violet', hex: '#8a72c4' }, { key: 'rose', hex: '#c46f9b' }
];

/** Can this layer be renamed? Only the ones the user made or fills themselves:
    Terrain, Light & weather and Grid are what they are, and an input that
    refuses the change is worse than no input. */
function layerRenameable(L) { return !!L && !LAYER_KINDS[L.kind].unique; }

/** Does a fade actually do anything here? Terrain is drawn straight onto an
    empty canvas, so fading it reveals nothing but the void behind it, and the
    effects row carries its strengths in Appearance instead. */
function layerCanFade(L) { return !!L && L.kind !== 'terrain' && L.kind !== 'effects'; }

/* A deliberately short list. Every one of these does something legible on a
   map; the rest of the CSS blend modes mostly produce mud over brown floors. */
const LAYER_BLENDS = [
  { key: 'normal', label: 'Normal' },
  { key: 'multiply', label: 'Multiply' },
  { key: 'screen', label: 'Screen' },
  { key: 'overlay', label: 'Overlay' },
  { key: 'soft-light', label: 'Soft light' },
  { key: 'darken', label: 'Darken' },
  { key: 'lighten', label: 'Lighten' }
];

/* Compose gets slower roughly in step with the number of layers that need
   their own scratch canvas, and a stack this deep is already past the point of
   being readable in a side panel. */
const LAYER_MAX = 16;

function makeLayer(id, kind, name, extra) {
  return Object.assign({
    id, kind,
    name: name || LAYER_KINDS[kind].label,
    visible: true,
    locked: false,
    opacity: 1,
    blend: 'normal',
    color: null        // a tag down the leading edge of the row; null is untagged
  }, extra || {});
}

/* The shipped stack, bottom first, and deliberately short: four rows, one for
   each thing that is actually a layer. Everything you place goes on Objects,
   which sits below the effects so it is lit and weathered along with the floor.
   Want a layer that escapes that — GM notes that stay legible through fog —
   drag it above the effects row, which is the one rule the stack asks you to
   learn. */
function defaultLayers() {
  return [
    makeLayer(1, 'terrain'),
    makeLayer(2, 'objects', 'Objects'),
    makeLayer(3, 'effects'),
    makeLayer(4, 'grid')
  ];
}
const DEFAULT_PROP_LAYER = 2;
const DEFAULT_LABEL_LAYER = 2;

/* Maps made before the stack existed have no `layers` and no `lay` on anything.
   They get the default stack and their objects land where those objects used to
   be drawn, so an old project opens looking exactly as it did. */
function ensureLayers(map) {
  if (!map.layers || !map.layers.length) {
    map.layers = defaultLayers();
    map.nextLid = 5;
  }
  // stacks from the three-effect-rows era: the first of them becomes the single
  // effects row, in its place, and the other two go
  let seenEffects = false;
  map.layers = map.layers.filter(L => {
    if (!LEGACY_EFFECT_KINDS[L.kind]) return true;
    if (seenEffects) return false;
    seenEffects = true;
    L.kind = 'effects';
    L.name = LAYER_KINDS.effects.label;
    L.opacity = 1;
    return true;
  });
  if (!map.nextLid) map.nextLid = map.layers.reduce((n, L) => Math.max(n, L.id), 0) + 1;
  // a stack must have exactly one terrain, at the bottom
  if (!map.layers.some(L => L.kind === 'terrain')) map.layers.unshift(makeLayer(map.nextLid++, 'terrain'));
  const ti = map.layers.findIndex(L => L.kind === 'terrain');
  if (ti > 0) map.layers.unshift(map.layers.splice(ti, 1)[0]);

  const objs = map.layers.filter(L => L.kind === 'objects');
  if (!objs.length) { const L = makeLayer(map.nextLid++, 'objects', 'Objects'); map.layers.push(L); objs.push(L); }
  const propHome = layerById(map, DEFAULT_PROP_LAYER) || objs[0];
  const labelHome = layerById(map, DEFAULT_LABEL_LAYER) || objs[objs.length - 1];
  const valid = new Set(objs.map(L => L.id));
  for (const p of map.props) if (!valid.has(p.lay)) p.lay = propHome.id;
  for (const l of (map.labels || [])) if (!valid.has(l.lay)) l.lay = labelHome.id;
  return map;
}

function layerById(map, id) {
  if (!map.layers) return null;
  for (const L of map.layers) if (L.id === id) return L;
  return null;
}
function layerIndex(map, id) { return map.layers.findIndex(L => L.id === id); }
function objectLayers(map) { return map.layers.filter(L => L.kind === 'objects'); }
function layerOfKind(map, kind) { return map.layers.find(L => L.kind === kind) || null; }

/* Objects carry their own hidden and locked flags as well as their layer's, so
   a single tree can be taken out without taking the wood with it. `hid` and
   `lk` are the short names because they are written on every object in the
   project file and most objects have neither. */

/** Is this object drawn? Not just a question about the picture: an object that
    is not drawn casts no light and blocks no sight either, in the editor and in
    every export. That is what makes hiding a way to get a players' copy. */
function objVisible(map, o) {
  if (o.hid) return false;
  const L = layerById(map, o.lay);
  return !L || L.visible;
}
/** Can the cursor have it? Drawn, and neither it nor its layer locked. */
function objEditable(map, o) {
  if (o.hid || o.lk) return false;
  const L = layerById(map, o.lay);
  return !L || (L.visible && !L.locked);
}
function visibleProps(map) { return map.props.filter(p => objVisible(map, p)); }

/* The z-order of one object inside its layer. Inkarnate calls it the sublayer
   and so does this: a whole layer is a heavy instrument for getting one rug
   under one table. Objects with the same sublayer keep the order they had —
   flat things under standing things, and nearer things last — so the number is
   only consulted when somebody has actually set one. */
function objSub(o) { return o.sub || 0; }

/** Every distinct sublayer present in `list`, low to high. */
function subLevels(list) {
  const seen = new Set();
  for (const o of list) seen.add(objSub(o));
  return [...seen].sort((a, b) => a - b);
}

/* Opacity and blend on one object, the same two controls its layer has. Absent
   is the common case and the cheap path, so both are read through a helper
   rather than defaulted onto every object in the file. */
function objOpacity(o) { return o.opacity === undefined ? 1 : o.opacity; }
function objBlend(o) { return o.blend || 'normal'; }
function objPlain(o) { return objOpacity(o) >= 0.999 && objBlend(o) === 'normal'; }

/** A short, human name for an object, for the tree. A name the user typed wins
    over the one the prop library or the label's own text supplies. */
function objLabel(o) {
  if (o.nm) return o.nm;
  if (o.text !== undefined) {
    const t = String(o.text).replace(/\s+/g, ' ').trim();
    return t ? (t.length > 22 ? t.slice(0, 21) + '…' : t) : 'Label';
  }
  const def = typeof PROPS !== 'undefined' && PROPS[o.type];
  const name = (def && (def.label || def.name)) || o.type || 'Object';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/* --- mutations. Each returns the layer it acted on, or null if it refused. --- */

/* `aboveId` null or missing means the top of the stack, which is where a new
   layer goes when nothing is selected to put it above — anywhere else and it
   arrives somewhere the eye was not, or worse, under the floor. */
function addObjectLayer(map, name, aboveId) {
  if (map.layers.length >= LAYER_MAX) return null;
  const L = makeLayer(map.nextLid++, 'objects', name || nextLayerName(map));
  const at = (aboveId === undefined || aboveId === null || layerIndex(map, aboveId) < 0)
    ? map.layers.length
    : layerIndex(map, aboveId) + 1;
  map.layers.splice(Math.max(1, at), 0, L);
  return L;
}

function nextLayerName(map) {
  const used = new Set(map.layers.map(L => L.name));
  for (let n = 1; ; n++) if (!used.has('Layer ' + n)) return 'Layer ' + n;
}

/** Deleting an object layer takes its contents with it. Deleting the last one
    is refused rather than silently leaving props with nowhere to live. */
function removeLayer(map, id) {
  const L = layerById(map, id);
  if (!L || LAYER_KINDS[L.kind].pinned) return null;
  if (L.kind === 'objects' && objectLayers(map).length <= 1) return null;
  if (L.kind === 'objects') {
    map.props = map.props.filter(p => p.lay !== id);
    map.labels = (map.labels || []).filter(l => l.lay !== id);
  }
  map.layers.splice(layerIndex(map, id), 1);
  return L;
}

/** dir -1 down, +1 up. Nothing may pass below the terrain. */
function moveLayer(map, id, dir) {
  const i = layerIndex(map, id);
  if (i < 0 || LAYER_KINDS[map.layers[i].kind].pinned) return null;
  const j = i + dir;
  if (j < 1 || j >= map.layers.length) return null;
  const [L] = map.layers.splice(i, 1);
  map.layers.splice(j, 0, L);
  return L;
}

/** Drop the layer at `id` into slot `to`, counting from the bottom. The list in
    the panel reads top-down, so it does the flip before calling this. */
function reorderLayer(map, id, to) {
  const i = layerIndex(map, id);
  if (i < 0 || LAYER_KINDS[map.layers[i].kind].pinned) return null;
  const dest = clamp(to, 1, map.layers.length - 1);
  if (dest === i) return null;
  const [L] = map.layers.splice(i, 1);
  map.layers.splice(dest, 0, L);
  return L;
}

/** Merge an object layer into the object layer beneath it. Only object layers
    merge: two filters do not combine into one filter, they compose. */
function mergeLayerDown(map, id) {
  const L = layerById(map, id);
  if (!L || L.kind !== 'objects') return null;
  const i = layerIndex(map, id);
  let below = null;
  for (let k = i - 1; k >= 1; k--) if (map.layers[k].kind === 'objects') { below = map.layers[k]; break; }
  if (!below) return null;
  for (const p of map.props) if (p.lay === id) p.lay = below.id;
  for (const l of (map.labels || [])) if (l.lay === id) l.lay = below.id;
  map.layers.splice(i, 1);
  return below;
}

function layerCounts(map, id) {
  let props = 0, labels = 0;
  for (const p of map.props) if (p.lay === id) props++;
  for (const l of (map.labels || [])) if (l.lay === id) labels++;
  return { props, labels, total: props + labels };
}
