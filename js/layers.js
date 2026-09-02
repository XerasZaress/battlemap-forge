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
  lighting: {
    label: 'Lighting', icon: 'flame', filter: true, unique: true, pinned: false,
    blurb: 'Baked light and shadow. Anything above it is not lit by it.'
  },
  finish: {
    label: 'Painted finish', icon: 'contrast', filter: true, unique: true, pinned: false,
    blurb: 'The paper grain and warm/cool wash. Only does anything in the painted style.'
  },
  atmos: {
    label: 'Weather', icon: 'sparkles', filter: true, unique: true, pinned: false,
    blurb: 'The colour grade and whatever is falling out of the sky.'
  },
  grid: {
    label: 'Grid', icon: 'grid', filter: false, unique: true, pinned: false,
    blurb: 'The lattice. Move it under a layer to have that layer draw over it.'
  }
};

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
    blend: 'normal'
  }, extra || {});
}

/* The shipped stack, bottom first. Props sit below the lighting so they are lit
   by it; labels sit above the weather and the grid so they stay readable, which
   is where they were drawn before any of this existed. Two object layers out of
   the box is also the shortest way to show what the stack is for. */
function defaultLayers() {
  return [
    makeLayer(1, 'terrain'),
    makeLayer(2, 'objects', 'Props'),
    makeLayer(3, 'lighting'),
    makeLayer(4, 'finish'),
    makeLayer(5, 'atmos'),
    makeLayer(6, 'grid'),
    makeLayer(7, 'objects', 'Labels')
  ];
}
const DEFAULT_PROP_LAYER = 2;
const DEFAULT_LABEL_LAYER = 7;

/* Maps made before the stack existed have no `layers` and no `lay` on anything.
   They get the default stack and their objects land where those objects used to
   be drawn, so an old project opens looking exactly as it did. */
function ensureLayers(map) {
  if (!map.layers || !map.layers.length) {
    map.layers = defaultLayers();
    map.nextLid = 8;
  }
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

/** Is this object on a layer that is currently drawn? Objects on a hidden layer
    are not just invisible: they cast no light and block no sight either, which
    is the whole point of hiding a layer before exporting a player copy. */
function objVisible(map, o) {
  const L = layerById(map, o.lay);
  return !L || L.visible;
}
function objEditable(map, o) {
  const L = layerById(map, o.lay);
  return !L || (L.visible && !L.locked);
}
function visibleProps(map) { return map.props.filter(p => objVisible(map, p)); }

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
