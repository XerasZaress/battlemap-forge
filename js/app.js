/* Battlemap Forge — application shell */
'use strict';

const $ = (id) => document.getElementById(id);

const state = {
  map: null,
  terrain: null,      // cached terrain layer
  cache: null,        // cached composite (terrain + props + light + grid)
  workPpg: 70,        // resolution the editor renders at
  view: { x: 0, y: 0, zoom: 1 },
  tool: 'select',
  mat: T.STONE,
  prop: 'barrel',
  propCat: 'furniture',
  roomKey: 'bedroom',
  roomCat: 'dwelling',
  roomRot: 0,
  roomFlip: false,
  selRoomId: null,     // id of the placed room being edited
  brush: 1,
  round: false,
  propRot: 0,          // radians, applied to newly placed props
  propScale: 1,
  propWidth: 1,
  propHeight: 1,
  propSunk: false,     // place the next prop below the water surface
  propVariant: 0,      // which form of a prop family to place
  placeMode: 'one',    // 'one' | 'many' | 'scatter' — how the Prop tool lays props down
  propArea: 1.5,       // scatter radius in grid squares
  propDensity: 0.5,
  selLabel: null,      // index into map.labels while a label is selected
  labelStyle: null,    // the style the next label is written in
  // Which layer new work lands on, kept per kind of object rather than as one
  // pointer: dropping a barrel and writing a name are different jobs and people
  // keep them on different layers, so one shared "active layer" would have you
  // re-picking it every time you changed tool.
  activeLay: { prop: 0, label: 0 },
  snapDeg: 90,         // 0 = free rotation
  selected: null,      // index into map.props while the Select tool is active
  undo: [], redo: [],
  drag: null,
  hover: null,
  bg: { img: null, ppg: 70, offX: 0, offY: 0 },
  spaceDown: false,
  waterPhase: 0,
  waterPath: null,
  lavaPath: null,
  shadows: null,
  shadowSig: null
};

const view = $('view');
const vctx = view.getContext('2d');
let dpr = window.devicePixelRatio || 1;

/* ---------------- misc ui helpers ---------------- */

let toastTimer = null;
function toast(msg, ms) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms || 2600);
}

function busy(on) { $('busy').classList.toggle('on', !!on); }

function num(id) { return parseFloat($(id).value); }

/* ---------------- render pipeline ---------------- */

function renderOptsFromUI(overrides) {
  return Object.assign(defaultRenderOpts(), {
    grid: $('optGrid').checked,
    gridColor: $('gridColor').value,
    gridAlpha: num('gridAlpha'),
    gridType: $('gridType').value,
    gridWeight: num('gridWeight'),
    gridOffX: num('gridOffX'),
    gridOffY: num('gridOffY'),
    gridRelief: $('gridRelief').checked,
    atmos: atmosFromUI(),
    lighting: $('optLighting').checked,
    ambient: num('ambient'),
    ambientColor: $('ambientColor').value,
    vignette: $('optVignette').checked,
    style: $('optStyle').value,
    water: { flow: num('waterFlow'), speed: num('waterSpeed'), phase: state.waterPhase },
    roomLighting: $('optRoomLight').checked,
    shadows: $('optShadows').checked
  }, overrides || {});
}

function pickWorkPpg(map) {
  const maxDim = 4096;
  const cap = Math.floor(maxDim / Math.max(map.w, map.h));
  return clamp(Math.min(map.ppg, cap), 12, 200);
}

function drawBackgroundImage(ctx, map, u) {
  const b = state.bg;
  const k = u / b.ppg;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#0c0d12';
  ctx.fillRect(0, 0, map.w * u, map.h * u);
  ctx.drawImage(b.img, -b.offX * k, -b.offY * k, b.img.width * k, b.img.height * k);
}

function buildTerrain() {
  const map = state.map;
  if (!state.rooms) state.rooms = findRooms(map);
  state.workPpg = pickWorkPpg(map);
  const u = state.workPpg;
  const cv = makeCanvas(map.w * u, map.h * u);
  const ctx = cv.getContext('2d');
  const seed = hashString(String(map.seed)) & 0xffff;
  const opts = renderOptsFromUI();

  if (state.bg.img) {
    drawBackgroundImage(ctx, map, u);
    // show traced walls as an overlay so they're visible over the art
    ctx.fillStyle = 'rgba(214,64,52,0.42)';
    ctx.strokeStyle = 'rgba(255,120,100,0.75)';
    ctx.lineWidth = Math.max(1, u * 0.03);
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      if (!isWallTile(map.get(x, y))) continue;
      ctx.fillRect(x * u, y * u, u, u);
      ctx.strokeRect(x * u + 0.5, y * u + 0.5, u - 1, u - 1);
    }
  } else {
    drawBase(ctx, map, u, opts, seed);
    drawTileDetail(ctx, map, u, seed, roomIndexMap(map, state.rooms), num('waterFlow'));
    drawWalls(ctx, map, u, opts, seed);
  }
  state.terrain = cv;
  // caustics stay out of the cache so they can animate without a re-render
  state.waterPath = state.bg.img ? null : waterPath2D(map, u);
  state.lavaPath = state.bg.img ? null : lavaPath2D(map, u);
}

/* Everything above the terrain. Edge walls belong here rather than in the
   terrain layer so painting a partition or cutting a door shows up without
   re-rendering the whole floor. */
function compose() {
  const map = state.map, u = state.workPpg;
  const opts = renderOptsFromUI();
  const seed = hashString(String(map.seed)) & 0xffff;
  const cv = makeCanvas(map.w * u, map.h * u);
  const ctx = cv.getContext('2d');

  if (opts.lighting) {
    const sig = lightSignature(map);
    if (state.shadowSig !== sig) {
      state.shadows = computeLightShadows(map).polys;
      state.shadowSig = sig;
    }
  }
  // the editor hands the walk what it already has: the terrain rendered once
  // and kept until something under the props changes, and the liquid paths that
  // let the caustics animate without touching the rest of the stack
  drawLayerStack(ctx, map, u, opts, seed, {
    rooms: state.rooms,
    shadows: state.shadows,
    terrain: state.terrain,
    // the cached terrain already carries the traced art and its red overlay,
    // so the flag is all the walk needs — it must not draw either of them again
    bgImage: state.bg.img || null,
    waterPath: state.waterPath,
    lavaPath: state.lavaPath,
    liquidOpts: { water: { flow: num('waterFlow'), speed: num('waterSpeed'), phase: state.waterPhase } }
  });
  state.cache = cv;
}

let rafPending = false;
function refresh(full) {
  // rooms drive interior lighting and floorboard direction, and depend on edges
  state.rooms = findRooms(state.map);
  if (full) buildTerrain();
  compose();
  if (state.waterPath || state.lavaPath) startWaterAnimation(); else stopWaterAnimation();
  if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; paint(); }); }
  updateStats();
  buildLayerPanel();
  buildObjectsPanel();
}

function paint() {
  const cssW = view.clientWidth, cssH = view.clientHeight;
  if (view.width !== Math.round(cssW * dpr) || view.height !== Math.round(cssH * dpr)) {
    view.width = Math.round(cssW * dpr); view.height = Math.round(cssH * dpr);
  }
  vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  vctx.clearRect(0, 0, cssW, cssH);
  if (!state.cache) return;

  const z = state.view.zoom;
  vctx.imageSmoothingEnabled = z < 1.05;
  vctx.imageSmoothingQuality = 'high';
  vctx.drawImage(state.cache, state.view.x, state.view.y, state.cache.width * z, state.cache.height * z);

  drawOverlay(cssW, cssH);
  updateFloatBar();
}

function drawOverlay() {
  const map = state.map, z = state.view.zoom, s = state.workPpg * z;
  const ox = state.view.x, oy = state.view.y;

  // map bounds
  vctx.strokeStyle = 'rgba(201,162,39,0.55)';
  vctx.lineWidth = 1;
  vctx.strokeRect(ox - 0.5, oy - 0.5, map.w * s + 1, map.h * s + 1);

  // rectangle / room drag preview
  if (state.drag && (state.drag.mode === 'rect' || state.drag.mode === 'room' || state.drag.mode === 'capture')) {
    const d = state.drag;
    const x0 = Math.min(d.x0, d.x1), y0 = Math.min(d.y0, d.y1);
    const w = Math.abs(d.x1 - d.x0) + 1, h = Math.abs(d.y1 - d.y0) + 1;
    vctx.fillStyle = 'rgba(201,162,39,0.22)';
    vctx.strokeStyle = 'rgba(201,162,39,0.9)';
    vctx.lineWidth = d.mode === 'room' ? Math.max(3, WALL_THICKNESS * s) : 2;
    vctx.fillRect(ox + x0 * s, oy + y0 * s, w * s, h * s);
    vctx.strokeRect(ox + x0 * s, oy + y0 * s, w * s, h * s);
    if (d.mode === 'room') {
      vctx.fillStyle = 'rgba(255,255,255,0.85)';
      vctx.font = '11px sans-serif';
      vctx.fillText(w + ' × ' + h + ' squares', ox + x0 * s + 4, oy + y0 * s - 5);
    }
    return;
  }

  // prefab ghost: the actual room, oriented, so you can see it before placing
  if (state.tool === 'stamp' && state.hover && ROOMS[state.roomKey]) {
    const o = stampOrigin(state.hover);
    const fits = o.ox >= 0 && o.oy >= 0 && o.ox + o.w <= state.map.w && o.oy + o.h <= state.map.h;
    const ghost = stampGhost();
    if (ghost) {
      vctx.save();
      vctx.globalAlpha = fits ? 0.8 : 0.4;
      vctx.imageSmoothingEnabled = true;
      vctx.drawImage(ghost, ox + o.ox * s, oy + o.oy * s, o.w * s, o.h * s);
      vctx.restore();
    }
    vctx.strokeStyle = fits ? 'rgba(201,162,39,0.95)' : 'rgba(208,86,63,0.95)';
    vctx.lineWidth = Math.max(2, WALL_THICKNESS * s * 0.5);
    vctx.strokeRect(ox + o.ox * s, oy + o.oy * s, o.w * s, o.h * s);
    return;
  }

  // partition cursor: highlight the edge that would be painted
  if (state.tool === 'edge' || state.tool === 'door') {
    const hv2 = state.hover;
    if (hv2) {
      const e = nearestEdge(hv2.fx, hv2.fy);
      if (e.d <= 0.4) {
        vctx.strokeStyle = 'rgba(201,162,39,0.95)';
        vctx.lineWidth = Math.max(3, WALL_THICKNESS * s);
        vctx.lineCap = 'round';
        vctx.beginPath();
        if (e.dir === 'h') {
          vctx.moveTo(ox + e.x * s, oy + e.y * s);
          vctx.lineTo(ox + (e.x + 1) * s, oy + e.y * s);
        } else {
          vctx.moveTo(ox + e.x * s, oy + e.y * s);
          vctx.lineTo(ox + e.x * s, oy + (e.y + 1) * s);
        }
        vctx.stroke();
      }
    }
    return;
  }

  drawRoomSelection();
  drawSelection();
  drawLabelSelection();

  // scatter cursor: the disc props will be sown into
  if (state.tool === 'prop' && state.placeMode === 'scatter' && state.hover) {
    vctx.strokeStyle = 'rgba(201,162,39,0.85)';
    vctx.lineWidth = 1.5;
    vctx.setLineDash([4, 4]);
    vctx.beginPath();
    vctx.arc(ox + state.hover.fx * s, oy + state.hover.fy * s, state.propArea * s, 0, Math.PI * 2);
    vctx.stroke();
    vctx.setLineDash([]);
    return;
  }

  // brush cursor
  const hv = state.hover;
  if (!hv || state.tool === 'pan' || state.tool === 'select' || state.tool === 'text') return;
  const r = state.tool === 'brush' || state.tool === 'erase' || state.tool === 'wall' ? state.brush - 1 : 0;
  vctx.strokeStyle = 'rgba(255,255,255,0.75)';
  vctx.lineWidth = 1.5;
  if (state.round && r > 0) {
    vctx.beginPath();
    vctx.arc(ox + (hv.x + 0.5) * s, oy + (hv.y + 0.5) * s, (r + 0.5) * s, 0, Math.PI * 2);
    vctx.stroke();
  } else {
    vctx.strokeRect(ox + (hv.x - r) * s, oy + (hv.y - r) * s, (r * 2 + 1) * s, (r * 2 + 1) * s);
  }
}

/* ---------------- anchor handles ---------------- *
 * Eight scale handles round the selection plus a rotation handle on a stalk,
 * all living in screen space so they stay the same size at any zoom.
 * Corners scale uniformly; side handles stretch one axis. */

const HANDLE_HIT = 11;
const HANDLE_DEFS = [
  { id: 'nw', lx: -1, ly: -1, kind: 'corner' },
  { id: 'n', lx: 0, ly: -1, kind: 'edgeV' },
  { id: 'ne', lx: 1, ly: -1, kind: 'corner' },
  { id: 'e', lx: 1, ly: 0, kind: 'edgeH' },
  { id: 'se', lx: 1, ly: 1, kind: 'corner' },
  { id: 's', lx: 0, ly: 1, kind: 'edgeV' },
  { id: 'sw', lx: -1, ly: 1, kind: 'corner' },
  { id: 'w', lx: -1, ly: 0, kind: 'edgeH' }
];

function propHandles(p) {
  const s = state.workPpg * state.view.zoom;
  const { hx, hy } = propHalfExtents(p);
  const cx = state.view.x + p.x * s, cy = state.view.y + p.y * s;
  const rot = p.rot || 0, cos = Math.cos(rot), sin = Math.sin(rot);
  const place = (ox, oy) => [cx + ox * cos - oy * sin, cy + ox * sin + oy * cos];
  const list = HANDLE_DEFS.map(d => {
    const [x, y] = place(d.lx * hx * s, d.ly * hy * s);
    return Object.assign({ x, y }, d);
  });
  const [ax, ay] = place(0, -hy * s);
  const [rx, ry] = place(0, -hy * s - 26);
  list.push({ id: 'rotate', kind: 'rotate', x: rx, y: ry, ax, ay });
  return { list, cx, cy, s };
}

function hitHandle(sx, sy) {
  const p = selectedProp();
  if (!p || state.tool !== 'select') return null;
  for (const h of propHandles(p).list)
    if (Math.hypot(h.x - sx, h.y - sy) <= HANDLE_HIT) return h;
  return null;
}

function screenPos(ev) {
  const r = view.getBoundingClientRect();
  return { sx: ev.clientX - r.left, sy: ev.clientY - r.top };
}

function beginHandleDrag(h, sp) {
  const p = selectedProp();
  const H = propHandles(p);
  const dx = sp.sx - H.cx, dy = sp.sy - H.cy;
  state.drag = {
    mode: 'handle', kind: h.kind,
    origScale: p.scale === undefined ? 1 : p.scale,
    startDist: Math.max(5, Math.hypot(dx, dy))
  };
}

function applyHandleDrag(sp, ev) {
  const d = state.drag, p = selectedProp();
  if (!p) return;
  if (!d.snapped) { d.snapped = true; snapshot(); }
  const s = state.workPpg * state.view.zoom;
  const cx = state.view.x + p.x * s, cy = state.view.y + p.y * s;
  const dx = sp.sx - cx, dy = sp.sy - cy;
  const def = PROPS[p.type];
  const base = (def ? def.size : 1) * s * (p.scale === undefined ? 1 : p.scale);

  if (d.kind === 'rotate') {
    const a = Math.atan2(dy, dx) + Math.PI / 2;
    p.rot = ev && ev.shiftKey ? normAngle(a) : snapAngle(a);   // shift = free angle
    state.propRot = p.rot;
  } else if (d.kind === 'corner') {
    p.scale = clamp(d.origScale * (Math.hypot(dx, dy) / d.startDist), 0.25, 4);
    state.propScale = p.scale;
  } else {
    const r = -(p.rot || 0), c = Math.cos(r), sn = Math.sin(r);
    const lx = dx * c - dy * sn, ly = dx * sn + dy * c;
    if (d.kind === 'edgeH') {
      p.width = clamp((2 * Math.abs(lx)) / Math.max(1e-6, base), 0.25, 4);
      state.propWidth = p.width;
    } else {
      p.height = clamp((2 * Math.abs(ly)) / Math.max(1e-6, base), 0.25, 4);
      state.propHeight = p.height;
    }
  }
  syncLightsFromProps(state.map);
  syncTransformUI();
  refresh(false);
}

/* ---------------- floating toolbar ---------------- */

const FLOAT_ACTIONS = [
  { act: 'turn', icon: 'rotateCw', title: 'Turn (R)' },
  { act: 'flip', icon: 'flipH', title: 'Flip (X)' },
  { act: 'copy', icon: 'copy', title: 'Duplicate (D)' },
  { act: 'delete', icon: 'trash', title: 'Delete (⌫)', cls: 'danger' }
];

function buildFloatBar() {
  const bar = $('floatBar');
  if (bar.dataset.built) return;
  for (const a of FLOAT_ACTIONS) {
    const b = document.createElement('button');
    b.innerHTML = iconSvg(a.icon);
    b.title = a.title;
    b.setAttribute('aria-label', a.title);
    if (a.cls) b.className = a.cls;
    b.addEventListener('pointerdown', e => e.stopPropagation());
    b.addEventListener('click', () => floatAction(a.act));
    bar.appendChild(b);
  }
  bar.dataset.built = '1';
}

/** Screen-space bounds of whatever is selected. */
function selectionScreenBox() {
  const s = state.workPpg * state.view.zoom;
  const pl = selectedRoom();
  if (pl) return { x: state.view.x + pl.x * s, y: state.view.y + pl.y * s, w: pl.w * s, h: pl.h * s };
  const p = selectedProp();
  if (!p) return null;
  const pts = propHandles(p).list.filter(h => h.kind !== 'rotate');
  const xs = pts.map(h => h.x), ys = pts.map(h => h.y);
  const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  const y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function updateFloatBar() {
  const bar = $('floatBar');
  const box = (state.tool === 'select' || state.tool === 'room') ? selectionScreenBox() : null;
  if (!box) { bar.classList.remove('on'); return; }
  bar.classList.add('on');
  const stage = $('stage');
  const bw = bar.offsetWidth || 148, bh = bar.offsetHeight || 34;
  let x = box.x + box.w / 2 - bw / 2;
  let y = box.y - bh - 16;                       // above the selection…
  if (y < 6) y = box.y + box.h + 16;             // …unless there's no room
  bar.style.left = Math.round(clamp(x, 6, Math.max(6, stage.clientWidth - bw - 6))) + 'px';
  bar.style.top = Math.round(clamp(y, 6, Math.max(6, stage.clientHeight - bh - 6))) + 'px';
}

function floatAction(act) {
  const pl = selectedRoom();
  if (pl) {
    if (act === 'turn') mutateRoom({ rot: (pl.rot + 1) % 4 });
    else if (act === 'flip') mutateRoom({ flip: !pl.flip });
    else if (act === 'copy') duplicateRoom();
    else if (act === 'delete') deleteRoom();
    return;
  }
  const p = selectedProp();
  if (!p) return;
  if (act === 'turn') {
    snapshot();
    state.propRot = snapAngle((p.rot || 0) + (state.snapDeg || 90) * Math.PI / 180);
    applyTransformToSelection(); syncTransformUI();
  } else if (act === 'flip') {
    snapshot();
    p.mirror = !p.mirror;
    refresh(false);
  } else if (act === 'copy') {
    snapshot();
    const copy = JSON.parse(JSON.stringify(p));
    copy.x += 0.6; copy.y += 0.6;
    delete copy.pid;                    // a copy belongs to you, not to a room
    delete copy.sd;                     // and rolls its own detail, so that two
    delete copy.type;                   // rubble piles are not twins
    state.map.addProp(p.type, copy.x, copy.y, copy);
    syncLightsFromProps(state.map);
    selectProp(state.map.props.length - 1);
    refresh(false);
  } else if (act === 'delete') {
    snapshot();
    state.map.props.splice(state.selected, 1);
    state.selected = null;
    syncLightsFromProps(state.map);
    syncTransformUI();
    refresh(false);
    toast('Prop deleted — ⌘Z puts it back.');
  }
}

/** Outline and label for the selected placed room. */
function drawRoomSelection() {
  const pl = selectedRoom();
  if (!pl) return;
  const s = state.workPpg * state.view.zoom;
  const x = state.view.x + pl.x * s, y = state.view.y + pl.y * s;
  const w = pl.w * s, h = pl.h * s;

  vctx.save();
  vctx.strokeStyle = 'rgba(0,0,0,0.6)';
  vctx.lineWidth = 4;
  vctx.strokeRect(x, y, w, h);
  vctx.strokeStyle = 'rgba(201,162,39,0.95)';
  vctx.lineWidth = 2;
  vctx.setLineDash([8, 5]);
  vctx.strokeRect(x, y, w, h);
  vctx.setLineDash([]);

  vctx.fillStyle = '#fff';
  vctx.strokeStyle = 'rgba(0,0,0,0.6)';
  vctx.lineWidth = 1;
  for (const [cx, cy] of [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]) {
    vctx.beginPath(); vctx.rect(cx - 4, cy - 4, 8, 8);
    vctx.fill(); vctx.stroke();
  }

  const label = (ROOMS[pl.key] && ROOMS[pl.key].label) || pl.key;
  vctx.font = '600 12px -apple-system, sans-serif';
  const tw = vctx.measureText(label).width;
  vctx.fillStyle = 'rgba(20,22,28,0.9)';
  vctx.fillRect(x, y - 20, tw + 12, 18);
  vctx.fillStyle = '#c9a227';
  vctx.fillText(label, x + 6, y - 7);
  vctx.restore();
}

/** Oriented box, corner handles and a facing arrow for the selected prop. */
function drawSelection() {
  const p = selectedProp();
  if (!p) return;
  const s = state.workPpg * state.view.zoom;
  const { hx, hy } = propHalfExtents(p);
  vctx.save();
  vctx.translate(state.view.x + p.x * s, state.view.y + p.y * s);
  vctx.rotate(p.rot || 0);

  vctx.strokeStyle = 'rgba(0,0,0,0.65)';
  vctx.lineWidth = 3;
  vctx.strokeRect(-hx * s, -hy * s, hx * 2 * s, hy * 2 * s);
  vctx.strokeStyle = 'rgba(201,162,39,0.95)';
  vctx.lineWidth = 1.5;
  vctx.setLineDash([6, 4]);
  vctx.strokeRect(-hx * s, -hy * s, hx * 2 * s, hy * 2 * s);
  vctx.setLineDash([]);

  // facing arrow, along the axis the width handles stretch
  vctx.beginPath();
  vctx.moveTo(0, 0); vctx.lineTo(hx * s + 16, 0);
  vctx.stroke();
  vctx.beginPath();
  vctx.arc(hx * s + 19, 0, 3.5, 0, Math.PI * 2);
  vctx.fillStyle = 'rgba(201,162,39,0.95)';
  vctx.fill();
  vctx.restore();

  // handles are drawn unrotated in screen space so they stay square and legible
  const H = propHandles(p);
  const rh = H.list.find(h => h.kind === 'rotate');
  vctx.save();
  vctx.strokeStyle = 'rgba(201,162,39,0.95)';
  vctx.lineWidth = 1.5;
  vctx.beginPath();
  vctx.moveTo(rh.ax, rh.ay); vctx.lineTo(rh.x, rh.y);
  vctx.stroke();

  for (const h of H.list) {
    vctx.beginPath();
    if (h.kind === 'rotate') vctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
    else vctx.rect(h.x - 4.5, h.y - 4.5, 9, 9);
    vctx.fillStyle = h.kind === 'rotate' ? '#c9a227' : '#fff';
    vctx.fill();
    vctx.strokeStyle = 'rgba(0,0,0,0.75)';
    vctx.lineWidth = 1.5;
    vctx.stroke();
  }
  vctx.restore();
}

/* ---------------- water animation ----------------
   Only the caustic overlay is redrawn each frame, so this costs two blits
   rather than a re-render of the map. */

let _waterRAF = null, _waterLast = 0, _waterNext = 0, _waterCost = 0, _waterFrames = 0;
const WATER_FPS = 12;

function waterTick(ts) {
  _waterRAF = null;
  if (!state.map || !$('waterAnimate').checked || !(state.waterPath || state.lavaPath)) return;
  if (ts >= _waterNext) {
    const dt = _waterLast ? Math.min(0.25, (ts - _waterLast) / 1000) : 0.08;
    _waterLast = ts;
    state.waterPhase += dt;
    // re-compositing is what puts the caustics under the props, so it has to
    // happen per frame; if that turns out to be expensive on this map, stop
    // rather than making the whole editor sluggish
    const t0 = performance.now();
    compose();
    paint();
    // average a few frames before judging: the first redraw after a change is
    // always the slowest and should not condemn the whole animation
    const cost = performance.now() - t0;
    _waterCost = _waterCost ? _waterCost * 0.6 + cost * 0.4 : cost;
    _waterFrames++;
    if (_waterFrames > 3 && _waterCost > 90) {
      $('waterAnimate').checked = false;
      stopWaterAnimation();
      toast('Water animation paused — redrawing this map costs about '
        + Math.round(_waterCost) + ' ms a frame. Switching Art style to Clean, or using a '
        + 'smaller grid size, makes it smooth. The water still looks right standing still.', 7000);
      return;
    }
    _waterNext = ts + 1000 / WATER_FPS;
  }
  _waterRAF = requestAnimationFrame(waterTick);
}

function startWaterAnimation() {
  if (_waterRAF || !$('waterAnimate').checked) return;
  _waterLast = 0; _waterNext = 0; _waterCost = 0; _waterFrames = 0;
  _waterRAF = requestAnimationFrame(waterTick);
}

function stopWaterAnimation() {
  if (_waterRAF) cancelAnimationFrame(_waterRAF);
  _waterRAF = null;
}

/* ---------------- viewport ---------------- */

function fitView() {
  if (!state.cache) return;
  const cssW = view.clientWidth, cssH = view.clientHeight;
  const z = Math.min(cssW / state.cache.width, cssH / state.cache.height) * 0.94;
  state.view.zoom = z;
  state.view.x = (cssW - state.cache.width * z) / 2;
  state.view.y = (cssH - state.cache.height * z) / 2;
  updateZoomLabel(); paint();
}

function zoomAt(cx, cy, factor) {
  const v = state.view;
  const nz = clamp(v.zoom * factor, 0.05, 8);
  v.x = cx - (cx - v.x) * (nz / v.zoom);
  v.y = cy - (cy - v.y) * (nz / v.zoom);
  v.zoom = nz;
  updateZoomLabel(); paint();
}

function updateZoomLabel() {
  const pct = Math.round(state.view.zoom * (state.workPpg / (state.map ? state.map.ppg : 70)) * 100);
  $('zoomVal').textContent = pct + '%';
}

function screenToCell(ev) {
  const rect = view.getBoundingClientRect();
  const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
  const s = state.workPpg * state.view.zoom;
  return {
    x: Math.floor((sx - state.view.x) / s),
    y: Math.floor((sy - state.view.y) / s),
    fx: (sx - state.view.x) / s,
    fy: (sy - state.view.y) / s
  };
}

/* ---------------- undo ---------------- */

function snapshot() {
  state.undo.push(state.map.clone());
  if (state.undo.length > 40) state.undo.shift();
  state.redo.length = 0;
  updateUndoButtons();
}
function undo() {
  if (!state.undo.length) return;
  state.redo.push(state.map.clone());
  state.map = state.undo.pop();
  state.selected = null; state.selRoomId = null; state.selLabel = null;
  syncTransformUI(); syncRoomSelUI(); syncLabelUI();
  refresh(true); updateUndoButtons();
}
function redo() {
  if (!state.redo.length) return;
  state.undo.push(state.map.clone());
  state.map = state.redo.pop();
  state.selected = null; state.selRoomId = null; state.selLabel = null;
  syncTransformUI(); syncRoomSelUI(); syncLabelUI();
  refresh(true); updateUndoButtons();
}
function updateUndoButtons() {
  $('undoBtn').disabled = !state.undo.length;
  $('redoBtn').disabled = !state.redo.length;
}

/* ---------------- editing ---------------- */

function brushCells(cx, cy, cb) {
  const r = state.brush - 1;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (state.round && Math.hypot(dx, dy) > r + 0.35) continue;
    cb(cx + dx, cy + dy);
  }
}

function applyPaint(cell, mat) {
  const map = state.map;
  let changed = false;
  brushCells(cell.x, cell.y, (x, y) => {
    if (map.inBounds(x, y) && map.get(x, y) !== mat) { map.set(x, y, mat); changed = true; }
  });
  return changed;
}

function nearestObject(fx, fy, maxDist) {
  const map = state.map;
  let best = null, bd = maxDist * maxDist;
  // `skip` rather than a filtered list, because the index returned is spliced
  // out of the real array by the caller and must stay an index into it
  const test = (list, kind, skip) => {
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (skip && skip(o)) continue;
      const ox = kind === 'prop' || kind === 'light' ? o.x : o.x + 0.5;
      const oy = kind === 'prop' || kind === 'light' ? o.y : o.y + 0.5;
      const d = (ox - fx) ** 2 + (oy - fy) ** 2;
      if (d < bd) { bd = d; best = { kind, index: i }; }
    }
  };
  test(map.props, 'prop', p => !objEditable(map, p));
  test(map.doors, 'door');
  test(map.lights.filter(l => !l.fromProp), 'light');
  return best;
}

function deleteAt(fx, fy) {
  const map = state.map;
  const hit = nearestObject(fx, fy, 0.9);
  if (!hit) {
    // A label's hit box is the whole run of text, which is often wide enough to
    // cover half a room. So it is the last thing tested, not the first:
    // erasing the barrel under "The Rusty Flagon" should get the barrel.
    const li = pickLabel(map, fx, fy, true);
    if (li == null) return false;
    map.labels.splice(li, 1);
    if (state.selLabel != null) { state.selLabel = null; syncLabelUI(); }
    return true;
  }
  if (state.selected != null) { state.selected = null; syncTransformUI(); }
  if (hit.kind === 'prop') map.props.splice(hit.index, 1);
  else if (hit.kind === 'door') map.doors.splice(hit.index, 1);
  else {
    const manual = map.lights.filter(l => !l.fromProp);
    const target = manual[hit.index];
    map.lights.splice(map.lights.indexOf(target), 1);
  }
  syncLightsFromProps(map);
  return true;
}

function placeDoor(cell) {
  const map = state.map;
  if (!map.inBounds(cell.x, cell.y)) return;

  // Prefer a partition under the cursor: cycle wall -> door -> secret -> wall.
  const e = nearestEdge(cell.fx, cell.fy);
  if (e.d <= 0.35) {
    const v = map.getEdge(e.x, e.y, e.dir);
    if (v === EDGE.WALL) { map.setEdge(e.x, e.y, e.dir, EDGE.DOOR); return; }
    if (v === EDGE.DOOR) { map.setEdge(e.x, e.y, e.dir, EDGE.SECRET); return; }
    if (v === EDGE.SECRET) { map.setEdge(e.x, e.y, e.dir, EDGE.WALL); return; }
  }

  // otherwise fall back to a door filling a gap in solid terrain
  const existing = map.doors.findIndex(d => d.x === cell.x && d.y === cell.y);
  if (existing >= 0) { map.doors[existing].secret = !map.doors[existing].secret; return; }
  const horiz = isOpen(map.get(cell.x - 1, cell.y)) && isOpen(map.get(cell.x + 1, cell.y));
  map.doors.push({ x: cell.x, y: cell.y, dir: horiz ? 'v' : 'h', secret: false, open: false });
}

function paintEdge(cell, value) {
  const e = nearestEdge(cell.fx, cell.fy);
  if (e.d > 0.4) return false;
  if (state.map.getEdge(e.x, e.y, e.dir) === value) return false;
  state.map.setEdge(e.x, e.y, e.dir, value);
  return true;
}

/** The prefab as it will actually land, honouring the turn/flip controls. */
function orientedRoom() {
  return transformRoom(state.roomKey, state.roomRot, state.roomFlip);
}

function stampOrigin(cell) {
  const r = orientedRoom();
  if (!r) return null;
  return { ox: cell.x - ((r.w / 2) | 0), oy: cell.y - ((r.h / 2) | 0), w: r.w, h: r.h };
}

function stampPrefab(cell) {
  const o = stampOrigin(cell);
  if (!o) return false;
  return !!addPlacement(state.map, state.roomKey, o.ox, o.oy, state.roomRot, state.roomFlip,
    { connect: $('roomConnect').checked });
}

/* ---------------- placed rooms as live objects ---------------- */

function selectedRoom() {
  if (state.selRoomId == null || !state.map) return null;
  return state.map.placements.find(p => p.id === state.selRoomId) || null;
}

function selectRoom(id) {
  state.selected = null;          // rooms and props are mutually exclusive
  state.selRoomId = id;
  syncRoomSelUI();
  syncTransformUI();
  paint();
}

function deselectRoom() {
  if (state.selRoomId == null) return;
  state.selRoomId = null;
  syncRoomSelUI();
  paint();
}

function syncRoomSelUI() {
  const pl = selectedRoom();
  $('roomSelBox').classList.toggle('on', !!pl);
  if (pl) {
    const r = ROOMS[pl.key];
    $('roomSelName').textContent =
      ((r && r.label) || pl.key) + ' — ' + pl.w + '×' + pl.h + ' · ' +
      (pl.rot * 90) + '°' + (pl.flip ? ' mirrored' : '');
  }
}

/** Apply a change to the selected room and redraw. */
function mutateRoom(changes) {
  const pl = selectedRoom();
  if (!pl) return;
  snapshot();
  updatePlacement(state.map, pl, changes, { connect: $('roomConnect').checked });
  syncLightsFromProps(state.map);
  syncRoomSelUI();
  refresh(true);
}

function duplicateRoom() {
  const pl = selectedRoom();
  if (!pl) return;
  snapshot();
  const map = state.map;
  // try to the right, then below, then on top of itself
  const spots = [[pl.x + pl.w, pl.y], [pl.x, pl.y + pl.h], [pl.x + 1, pl.y + 1]];
  for (const [x, y] of spots) {
    const copy = addPlacement(map, pl.key, x, y, pl.rot, pl.flip, { connect: $('roomConnect').checked });
    if (copy) {
      syncLightsFromProps(map);
      selectRoom(copy.id);
      refresh(true);
      return;
    }
  }
  toast('No room for a copy — make the map bigger or move the original.', 3500);
}

function deleteRoom() {
  const pl = selectedRoom();
  if (!pl) return;
  snapshot();
  removePlacement(state.map, pl);
  state.selRoomId = null;
  syncLightsFromProps(state.map);
  syncRoomSelUI();
  refresh(true);
  toast('Room removed — what it was covering came back.');
}

/** A render of the oriented prefab, cached, used as the ghost under the cursor. */
const stampGhostCache = {};
function stampGhost() {
  const key = state.roomKey + '|' + state.roomRot + '|' + (state.roomFlip ? 1 : 0);
  if (stampGhostCache[key]) return stampGhostCache[key];
  const r = orientedRoom();
  if (!r) return null;
  const m = new GameMap(r.w, r.h, 40);
  m.seed = 'ghost-' + key;
  m.fill(T.VOID);
  stampRoom(m, state.roomKey, 0, 0, { rot: state.roomRot, flip: state.roomFlip });
  syncLightsFromProps(m);
  const cv = renderMap(m, Object.assign(defaultRenderOpts(), {
    grid: false, lighting: false, vignette: false, shadows: true
  }));
  stampGhostCache[key] = cv;
  return cv;
}

function updateOrientationLabel() {
  const r = orientedRoom();
  if (!r) return;
  $('roomOrient').innerHTML =
    '<b>' + r.label + '</b> — ' + r.w + ' × ' + r.h + ' squares · ' +
    (state.roomRot * 90) + '°' + (state.roomFlip ? ' · mirrored' : '');
}

function rotateRoom(dir) {
  state.roomRot = (state.roomRot + (dir || 1) + 4) % 4;
  updateOrientationLabel(); paint();
}
function flipRoom() {
  state.roomFlip = !state.roomFlip;
  updateOrientationLabel(); paint();
}

/* ---------------- edge walls & rooms ---------------- */

/** The cell edge nearest a fractional grid point. */
function nearestEdge(fx, fy) {
  const cx = Math.floor(fx), cy = Math.floor(fy);
  const dx = fx - cx, dy = fy - cy;
  const cands = [
    { x: cx, y: cy, dir: 'h', d: dy },
    { x: cx, y: cy + 1, dir: 'h', d: 1 - dy },
    { x: cx, y: cy, dir: 'v', d: dx },
    { x: cx + 1, y: cy, dir: 'v', d: 1 - dx }
  ];
  cands.sort((a, b) => a.d - b.d);
  return cands[0];
}

/** Wall every boundary between floor and non-floor, leaving existing doors alone. */
/**
 * Wall the outline of the painted floor plan.
 *
 * A boundary against solid masonry or rock is skipped: that stone is already a
 * wall — it blocks sight and movement on its own — so adding a thin partition
 * against it would double the barrier and draw two walls back to back.
 */
function autoWallFloorPlan(map) {
  let added = 0, skipped = 0;
  const alreadyWalled = (t) => isWallTile(t);

  for (let y = 0; y <= map.h; y++) for (let x = 0; x < map.w; x++) {
    if (isEdgeDoor(map.getH(x, y))) continue;
    const ta = y - 1 >= 0 ? map.get(x, y - 1) : T.VOID;
    const tb = y < map.h ? map.get(x, y) : T.VOID;
    const a = y - 1 >= 0 && isOpen(ta), b = y < map.h && isOpen(tb);
    if (a === b) continue;
    if (alreadyWalled(a ? tb : ta)) { skipped++; continue; }
    if (map.getH(x, y) !== EDGE.WALL) { map.setH(x, y, EDGE.WALL); added++; }
  }
  for (let x = 0; x <= map.w; x++) for (let y = 0; y < map.h; y++) {
    if (isEdgeDoor(map.getV(x, y))) continue;
    const ta = x - 1 >= 0 ? map.get(x - 1, y) : T.VOID;
    const tb = x < map.w ? map.get(x, y) : T.VOID;
    const a = x - 1 >= 0 && isOpen(ta), b = x < map.w && isOpen(tb);
    if (a === b) continue;
    if (alreadyWalled(a ? tb : ta)) { skipped++; continue; }
    if (map.getV(x, y) !== EDGE.WALL) { map.setV(x, y, EDGE.WALL); added++; }
  }
  return { added, skipped };
}

/** Drop partitions that no longer touch any floor at all. */
function pruneOrphanEdges(map) {
  for (let y = 0; y <= map.h; y++) for (let x = 0; x < map.w; x++) {
    if (!map.getH(x, y)) continue;
    const a = y - 1 >= 0 && isOpen(map.get(x, y - 1));
    const b = y < map.h && isOpen(map.get(x, y));
    if (!a && !b) map.setH(x, y, EDGE.NONE);
  }
  for (let x = 0; x <= map.w; x++) for (let y = 0; y < map.h; y++) {
    if (!map.getV(x, y)) continue;
    const a = x - 1 >= 0 && isOpen(map.get(x - 1, y));
    const b = x < map.w && isOpen(map.get(x, y));
    if (!a && !b) map.setV(x, y, EDGE.NONE);
  }
}

/** Drag-a-room: floor inside, walls around the outside. */
/** Drawn rooms are placements, not paint, so they stay movable and deletable. */
function buildRoom(x0, y0, x1, y1) {
  const map = state.map;
  const ax = Math.min(x0, x1), ay = Math.min(y0, y1);
  const bx = Math.max(x0, x1), by = Math.max(y0, y1);
  const w = bx - ax + 1, h = by - ay + 1;
  const withWalls = $('roomAutoWall').checked;

  const def = registerAdhocRoom(adhocRoomDef(w, h, state.mat, withWalls));
  const pl = addPlacement(map, def.key, ax, ay, 0, false, { connect: $('roomConnect').checked });
  if (!pl) {
    // ran off the edge of the map — fall back to plain paint
    delete ROOMS[def.key]; delete ADHOC_ROOMS[def.key];
    map.fillRect(ax, ay, bx, by, state.mat);
    if (withWalls) map.wallRect(ax, ay, bx, by, EDGE.WALL);
    return;
  }
  syncLightsFromProps(map);
  selectRoom(pl.id);
}

/* ---------------- capturing a region as a prefab ---------------- */

function finishCapture(d) {
  const w = Math.abs(d.x1 - d.x0) + 1, h = Math.abs(d.y1 - d.y0) + 1;
  setTool('select');
  paint();
  if (w < 1 || h < 1) return;
  const name = prompt('Name this room:', 'My ' + w + '×' + h + ' Room');
  if (name === null) return;
  const def = captureRoom(state.map, d.x0, d.y0, d.x1, d.y1, name.trim() || 'My Room');
  if (!def) { toast('Nothing to capture there.', 3000); return; }
  registerCustomRoom(def);
  const stored = saveCustomRooms();
  state.roomCat = 'custom';
  state.roomKey = def.key;
  $('roomSearch').value = '';
  buildRoomPanel();
  ensurePanel('right', 'prefabs');
  toast('Saved "' + def.label + '" — ' + def.w + '×' + def.h + ' with ' + def.props.length +
    ' prop' + (def.props.length === 1 ? '' : 's') +
    (stored ? '' : ' (not persisted: storage blocked)'), 5000);
}

/* ---------------- prop transform ---------------- */

/** Minimum grab radius, in squares, for a stable rotate/scale pivot. */
const PIVOT_MIN = 0.3;

function normAngle(rad) { const t = Math.PI * 2; return ((rad % t) + t) % t; }

function snapAngle(rad) {
  if (!state.snapDeg) return normAngle(rad);
  const step = state.snapDeg * Math.PI / 180;
  return normAngle(Math.round(rad / step) * step);
}

function selectedProp() {
  if (state.selected == null || !state.map) return null;
  return state.map.props[state.selected] || null;
}

/** Half-extents in grid squares, honouring scale and the width stretch. */
function propHalfExtents(p) {
  const def = PROPS[p.type];
  const s = (def ? def.size : 1) * (p.scale === undefined ? 1 : p.scale);
  return {
    hx: (s * (p.width === undefined ? 1 : p.width)) / 2,
    hy: (s * (p.height === undefined ? 1 : p.height)) / 2
  };
}

/** Topmost prop whose oriented box contains the point. */
function pickProp(fx, fy) {
  // a prop on a hidden or locked layer is not there as far as the cursor is
  // concerned, which is the whole reason to lock a layer of undergrowth
  const list = state.map.props.map((p, i) => ({ p, i })).filter(e => objEditable(state.map, e.p));
  // the same order they are drawn in, so the cursor takes whatever is on top:
  // sublayer first, then flat things under standing things, then depth
  list.sort((a, b) => {
    const ua = PROPS[a.p.type] && PROPS[a.p.type].under ? 0 : 1;
    const ub = PROPS[b.p.type] && PROPS[b.p.type].under ? 0 : 1;
    return objSub(a.p) - objSub(b.p) || ua - ub || a.p.y - b.p.y;
  });
  for (let k = list.length - 1; k >= 0; k--) {
    const { p, i } = list[k];
    if (!PROPS[p.type]) continue;
    const a = -(p.rot || 0), cos = Math.cos(a), sin = Math.sin(a);
    const dx = fx - p.x, dy = fy - p.y;
    const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
    const { hx, hy } = propHalfExtents(p);
    if (Math.abs(lx) <= Math.max(hx, 0.3) && Math.abs(ly) <= Math.max(hy, 0.3)) return i;
  }
  return null;
}

function selectProp(i) {
  state.selected = i;
  const p = selectedProp();
  if (p) {
    state.propRot = p.rot || 0;
    state.propScale = p.scale === undefined ? 1 : p.scale;
    state.propWidth = p.width === undefined ? 1 : p.width;
    state.propHeight = p.height === undefined ? 1 : p.height;
    state.propVariant = p.vi || 0;
    state.prop = p.type;
    const def = PROPS[p.type];
    if (def && def.cat !== state.propCat) state.propCat = def.cat;
    buildPropPanel();
  }
  syncTransformUI();
  paint();
}

function deselectProp() {
  if (state.selected == null) return;
  state.selected = null;
  syncTransformUI();
  paint();
}

/** Push the slider values onto the prop currently being edited. */
function applyTransformToSelection() {
  const p = selectedProp();
  if (!p) return;
  p.rot = state.propRot;
  p.scale = state.propScale;
  p.width = state.propWidth;
  p.height = state.propHeight;
  syncLightsFromProps(state.map);
  refresh(false);
}

function syncLightUI() {
  const p = selectedProp();
  const def = p && PROPS[p.type];
  const on = !!(def && def.light);
  $('propLightBox').style.display = on ? '' : 'none';
  if (!on) return;
  const range = p.lightRange === undefined ? def.light.range : p.lightRange;
  const inten = p.lightIntensity === undefined ? def.light.intensity : p.lightIntensity;
  $('propLightColor').value = peHexOf(p.lightColor || def.light.color);
  $('propLightRange').value = range;
  $('propLightRangeLbl').textContent = range;
  $('propLightInt').value = inten;
  $('propLightIntLbl').textContent = (+inten).toFixed(2);
}

/** Push the light controls onto the selected prop. */
function applyLightToSelection() {
  const p = selectedProp();
  if (!p || !PROPS[p.type] || !PROPS[p.type].light) return;
  p.lightColor = $('propLightColor').value;
  p.lightRange = num('propLightRange');
  p.lightIntensity = num('propLightInt');
  $('propLightRangeLbl').textContent = p.lightRange;
  $('propLightIntLbl').textContent = p.lightIntensity.toFixed(2);
  syncLightsFromProps(state.map);
  refresh(false);
}

function syncTransformUI() {
  syncLightUI();
  const p = selectedProp();
  const deg = Math.round(normAngle(state.propRot) * 180 / Math.PI) % 360;
  $('propRot').value = deg;
  $('propRotLbl').textContent = deg;
  $('propScale').value = state.propScale;
  $('propScaleLbl').textContent = state.propScale.toFixed(2);
  $('propWidth').value = state.propWidth;
  $('propWidthLbl').textContent = state.propWidth.toFixed(2);
  $('propHeight').value = state.propHeight;
  $('propHeightLbl').textContent = state.propHeight.toFixed(2);
  $('propSunk').checked = p ? !!p.sunk : state.propSunk;
  buildVariantRow();
  $('transformBox').classList.toggle('editing', !!p);
  $('tformTitle').textContent = p
    ? 'Editing ' + ((PROPS[p.type] && PROPS[p.type].label) || 'prop')
    : 'Placement transform';
  $('tformHint').innerHTML = p
    ? 'Drag to move · <kbd>shift</kbd>-drag to turn · <kbd>alt</kbd>-drag to resize · <kbd>⌫</kbd> deletes · <kbd>esc</kbd> deselects.'
    : 'Applies to props you place next. Switch to the <b>Select</b> tool and click a prop to re-shape one already on the map.';
  drawPropPreview();
}

/**
 * The forms a family comes in, as a row of swatches under the preview.
 *
 * A family is one picker entry however many forms it has, so this is where the
 * choice lives. With a prop selected it re-forms that prop; with nothing
 * selected it chooses what the next one will be.
 */
function buildVariantRow() {
  const row = $('propVariants');
  if (!row) return;
  row.innerHTML = '';
  const fam = PROPS[state.prop];
  if (!fam || !fam.variants) return;
  const sel = selectedProp();
  const current = sel ? (sel.vi || 0) : state.propVariant;
  fam.variants.forEach((v, i) => {
    const b = document.createElement('button');
    b.title = v.label + '  ·  press C to cycle';
    b.className = i === current ? 'active' : '';
    const c = makeCanvas(30, 30);
    const cx = c.getContext('2d');
    cx.translate(15, 15);
    const d = propDefFor(fam, i);
    try { d.draw(cx, 26 / Math.max(1, d.size), seededFn(7)); } catch (e) { /* swatch only */ }
    b.appendChild(c);
    b.addEventListener('click', () => setPropVariant(i));
    row.appendChild(b);
  });
}

/** Choose a form: re-forms the selected prop, or sets what gets placed next. */
function setPropVariant(i) {
  const fam = PROPS[state.prop];
  if (!fam || !fam.variants) return;
  state.propVariant = ((i % fam.variants.length) + fam.variants.length) % fam.variants.length;
  const p = selectedProp();
  if (p && p.type === state.prop) {
    snapshot();
    p.vi = state.propVariant;
    refresh(false);
  }
  syncTransformUI();
}

/** Preview the current prop at the current transform, over a 3×3 patch of grid. */
function drawPropPreview() {
  const cv = $('propPreview');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const def = propDefFor(PROPS[state.prop], state.propVariant);
  if (!def) return;

  const cells = 3, u = W / cells;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < cells; i++) {
    ctx.moveTo(Math.round(i * u) + 0.5, 0); ctx.lineTo(Math.round(i * u) + 0.5, H);
    ctx.moveTo(0, Math.round(i * u) + 0.5); ctx.lineTo(W, Math.round(i * u) + 0.5);
  }
  ctx.stroke();

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(state.propRot);
  ctx.scale(state.propScale * state.propWidth, state.propScale * state.propHeight);
  try { def.draw(ctx, u, seededFn(7)); } catch (e) { /* preview only */ }
  ctx.restore();

  // facing arrow — also the axis the width slider stretches along
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(state.propRot);
  ctx.strokeStyle = 'rgba(201,162,39,0.9)';
  ctx.fillStyle = 'rgba(201,162,39,0.9)';
  ctx.lineWidth = 2;
  const L = W * 0.42;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L - 7, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(L - 9, -5); ctx.lineTo(L - 9, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function placeProp(cell) {
  const map = state.map, def = PROPS[state.prop];
  if (!def || !map.inBounds(cell.x, cell.y)) return;
  // counter as well as the clock, so rapid placements in one cell still differ
  placeProp.tick = (placeProp.tick || 0) + 1;
  const rnd = new RNG((Date.now() ^ (cell.x * 73856093) ^ (cell.y * 19349663) ^ (placeProp.tick * 83492791)) >>> 0);
  const vary = $('propRandomRot').checked && def.rand !== false;
  // the snap dropdown is authoritative here — snapAngle is a no-op when set to free
  const rot = vary ? snapAngle(rnd.range(0, Math.PI * 2)) : state.propRot;
  // the checkbox decides and nothing else: a prop that submerged itself the
  // moment it touched deep water contradicted the box sitting unticked, and the
  // veil that came with it read as the old blue tint coming back
  const sunk = state.propSunk;
  // a family scattered by the generator wants variety; one you place yourself
  // wants the form you picked
  const vi = def.variants ? (vary ? rnd.int(0, def.variants.length - 1) : state.propVariant) : 0;
  // mirroring is separate from the angle: a chair turned 180° still faces the
  // same way round, and for anything asymmetric that is the difference between
  // a row of props and a row of copies
  const mirror = $('propRandomFlip').checked && rnd.chance(0.5);
  map.addProp(state.prop, cell.fx, cell.fy, Object.assign({
    rot,
    scale: state.propScale * (vary ? rnd.range(0.9, 1.1) : 1),
    width: state.propWidth,
    height: state.propHeight
  }, sunk ? { sunk: true } : null, vi ? { vi } : null, mirror ? { mirror: true } : null));
  syncLightsFromProps(map);
}

function placeLight(cell) {
  state.map.lights.push({
    x: cell.fx, y: cell.fy, range: 4, intensity: 0.9, color: '#ff9d4c', fromProp: false
  });
}

/* ---------------- atmosphere ---------------- */

function atmosFromUI() {
  return {
    preset: $('atmosPreset').value,
    amount: num('atmosAmount'),
    sat: num('atmosSat'),
    contrast: num('atmosContrast'),
    warm: num('atmosWarm'),
    fade: num('atmosFade')
  };
}

function buildAtmosSelect() {
  const sel = $('atmosPreset');
  if (sel.options.length) return;
  for (const key of ATMOS_ORDER) {
    const o = document.createElement('option');
    o.value = key; o.textContent = ATMOS[key].label;
    sel.appendChild(o);
  }
}

function syncAtmosUI() {
  const a = ATMOS[$('atmosPreset').value];
  $('atmosNote').textContent = a ? a.hint : '';
  for (const [id, lbl, dp] of [['atmosAmount', 'atmosAmountLbl', 2], ['atmosSat', 'atmosSatLbl', 2],
    ['atmosContrast', 'atmosContrastLbl', 2], ['atmosWarm', 'atmosWarmLbl', 2], ['atmosFade', 'atmosFadeLbl', 2]])
    $(lbl).textContent = num(id).toFixed(dp);
}

/* ---------------- grid ---------------- */

function syncGridUI() {
  $('gridWeightLbl').textContent = num('gridWeight').toFixed(1);
  $('gridOffXLbl').textContent = num('gridOffX').toFixed(2);
  $('gridOffYLbl').textContent = num('gridOffY').toFixed(2);
  const t = $('gridType').value;
  $('gridNote').textContent = t === 'square'
    ? ''
    : 'Cells, walls and every VTT export stay on the square grid underneath — a '
      + (t === 'iso' ? 'diamond' : 'hex') + ' lattice is drawn on the image only.';
}

/* ---------------- labels ----------------
   The panel edits one thing at a time: whichever label is selected, or — with
   nothing selected — the style the next one will be written in. That is the
   same bargain the prop transform panel makes, and it means writing three
   labels in the same hand takes one trip through the controls. */

function labelTarget() {
  const l = selectedLabel();
  return l || state.labelStyle;
}

function selectedLabel() {
  if (state.selLabel == null || !state.map) return null;
  return state.map.labels[state.selLabel] || null;
}

function selectLabel(i) {
  state.selLabel = i;
  deselectProp();
  deselectRoom();
  syncLabelUI();
  paint();
}

function deselectLabel() {
  if (state.selLabel == null) return;
  state.selLabel = null;
  syncLabelUI();
  paint();
}

function buildLabelPanel() {
  const sel = $('lblFont');
  if (sel.options.length) return;
  for (const f of LABEL_FONTS) {
    const o = document.createElement('option');
    o.value = f.key; o.textContent = f.label;
    // the option previews its own face, which is the only honest way to choose
    o.style.fontFamily = f.stack;
    sel.appendChild(o);
  }
}

const LABEL_FIELDS = [
  ['lblText', 'text', 'value'], ['lblFont', 'font', 'value'], ['lblSize', 'size', 'num'],
  ['lblBold', 'bold', 'check'], ['lblItalic', 'italic', 'check'],
  ['lblColor', 'color', 'value'], ['lblOutline', 'outline', 'value'],
  ['lblOutlineW', 'outlineW', 'num'], ['lblShadow', 'shadow', 'check'],
  ['lblLetter', 'letter', 'num'], ['lblLineH', 'lineH', 'num'],
  ['lblAlign', 'align', 'value'], ['lblCurve', 'curve', 'num'], ['lblOpacity', 'opacity', 'num']
];

/** Panel to label. Angle is kept in radians on the label and degrees in the UI,
    the same split the prop transform uses. */
function applyLabelFromUI() {
  const t = labelTarget();
  if (!t) return;
  for (const [id, key, kind] of LABEL_FIELDS)
    t[key] = kind === 'num' ? num(id) : kind === 'check' ? $(id).checked : $(id).value;
  t.rot = num('lblRot') * Math.PI / 180;
  t._sig = null;                       // the cached measurement is now a lie
  syncLabelUI();
  if (selectedLabel()) refreshLabelSoon(); else paint();
}

/* A slider drag and a typed word both fire input events far faster than the map
   can be re-composited. Coalescing to one redraw a frame is enough — the eye
   cannot use more than that, and it keeps typing a name responsive on a map big
   enough for compositing to be the slow part. */
let _labelRaf = false;
function refreshLabelSoon() {
  if (_labelRaf) return;
  _labelRaf = true;
  requestAnimationFrame(() => { _labelRaf = false; refresh(false); });
}

function syncLabelUI() {
  const l = selectedLabel();
  const t = l || state.labelStyle;
  if (!t) return;
  for (const [id, key, kind] of LABEL_FIELDS) {
    const v = t[key];
    if (kind === 'check') $(id).checked = !!v;
    else $(id).value = v === undefined ? '' : v;
  }
  $('lblRot').value = String(Math.round((t.rot || 0) * 180 / Math.PI));
  $('lblSizeLbl').textContent = (+t.size).toFixed(2);
  $('lblOutlineWLbl').textContent = (+t.outlineW).toFixed(2);
  $('lblLetterLbl').textContent = (+t.letter).toFixed(2);
  $('lblLineHLbl').textContent = (+t.lineH).toFixed(2);
  $('lblCurveLbl').textContent = (+t.curve).toFixed(2);
  $('lblOpacityLbl').textContent = (+t.opacity).toFixed(2);
  $('lblRotLbl').textContent = String(Math.round((t.rot || 0) * 180 / Math.PI));
  $('labelHint').textContent = l
    ? 'Editing the selected label. Drag it to move, esc to deselect.'
    : 'Pick the Label tool and click the map to write on it. These settings are what the next label will look like.';
  $('lblDupe').disabled = !l;
  $('lblDelete').disabled = !l;
  if (typeof initRangeFill === 'function') initRangeFill();
}

/* Focus survives only if it is set after the pointer gesture's own focus
   handling. `click` is the last event of that sequence, so arming a one-shot
   listener there is the one place a focus() sticks. */
function focusLabelTextOnClick() {
  const grab = () => {
    const el = $('lblText');
    el.focus();
    el.select();
  };
  view.addEventListener('click', grab, { once: true });
  // A drag that never resolves to a click would otherwise leave the listener
  // armed and steal focus from wherever the next click lands.
  setTimeout(() => view.removeEventListener('click', grab), 700);
}

function placeLabel(cell) {
  const l = Object.assign({}, state.labelStyle, { x: cell.fx, y: cell.fy, lay: activeLayerId('label') });
  delete l._sig; delete l._m;
  state.map.labels.push(l);
  selectLabel(state.map.labels.length - 1);
  return l;
}

function deleteLabel() {
  if (state.selLabel == null) return;
  snapshot();
  state.map.labels.splice(state.selLabel, 1);
  state.selLabel = null;
  syncLabelUI();
  refresh(false);
  toast('Label deleted — ⌘Z puts it back.');
}

function duplicateLabel() {
  const l = selectedLabel();
  if (!l) return;
  snapshot();
  const copy = JSON.parse(JSON.stringify(l));
  delete copy._sig; delete copy._m;
  copy.x += 0.8; copy.y += 0.8;
  state.map.labels.push(copy);
  selectLabel(state.map.labels.length - 1);
  refresh(false);
}

/** A dashed box round the selected label, drawn in screen space so it stays the
    same weight at any zoom. */
function drawLabelSelection() {
  const l = selectedLabel();
  if (!l) return;
  const s = state.workPpg * state.view.zoom;
  const e = labelHalfExtents(l);
  vctx.save();
  vctx.translate(state.view.x + l.x * s, state.view.y + l.y * s);
  vctx.rotate(l.rot || 0);
  vctx.strokeStyle = 'rgba(201,162,39,0.95)';
  vctx.lineWidth = 1.5;
  vctx.setLineDash([5, 4]);
  vctx.strokeRect((e.cx - e.hw) * s, -e.hh * s, e.hw * 2 * s, e.hh * 2 * s);
  vctx.restore();
}

/* ---------------- scattering props ----------------
   Inkarnate's stamp tool can lay one object, a trail of them along the drag, or
   sow a patch. The trail and the patch are the same job at different scales:
   pick candidate points, reject any that land on top of something already
   there, and place what survives. Rejection rather than a grid is what keeps a
   scattered wood from reading as an orchard. */

function propSpacing() {
  const def = PROPS[state.prop];
  const size = (def && def.size ? def.size : 1) * (state.propScale || 1);
  return Math.max(0.22, size * 0.55);
}

/** Props of the *same kind* within `gap` of the point.
 *
 * Crowding is deliberately blind to everything else on the map. Scattering
 * undergrowth should not refuse because there is a barrel nearby — moss grows
 * round barrels — but two oaks in the same square is always a mistake. So the
 * rule is only ever "not another one of these here". */
function propCrowded(x, y, gap) {
  const g2 = gap * gap;
  const list = state.map.props, type = state.prop;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (p.type !== type) continue;
    if ((p.x - x) ** 2 + (p.y - y) ** 2 < g2) return true;
  }
  return false;
}

/** A ceiling, so a slow drag at full density cannot quietly grow a map into
    something the renderer takes a minute to draw. */
const PROP_LIMIT = 4000;
function propRoomLeft() { return PROP_LIMIT - state.map.props.length; }

/** Lay props along the segment the cursor has just travelled. `d` carries the
    previous sample so a fast drag still leaves an even trail rather than dots
    wherever the pointer events happened to land. */
function trailProps(cell, d) {
  const gap = propSpacing();
  let n = 0;
  const x0 = d.lastX === undefined ? cell.fx : d.lastX;
  const y0 = d.lastY === undefined ? cell.fy : d.lastY;
  const dist = Math.hypot(cell.fx - x0, cell.fy - y0);
  const steps = Math.max(1, Math.min(200, Math.ceil(dist / gap)));
  for (let i = 1; i <= steps; i++) {
    if (propRoomLeft() <= 0) break;
    const t = i / steps;
    const x = lerp(x0, cell.fx, t), y = lerp(y0, cell.fy, t);
    if (!state.map.inBounds(Math.floor(x), Math.floor(y))) continue;
    if (propCrowded(x, y, gap * 0.85)) continue;
    placeProp({ x: Math.floor(x), y: Math.floor(y), fx: x, fy: y });
    n++;
  }
  d.lastX = cell.fx; d.lastY = cell.fy;
  return n;
}

/** Sow the disc under the cursor.
 *
 * Density sets the *spacing*, not a count: at 1 the props pack as close as
 * their own footprints allow, and thinning it pushes them apart. Doing it that
 * way means the same slider reads the same on a barrel and on an oak, and that
 * dragging over ground you have already sown adds nothing rather than doubling
 * up — the rejection test sees what is already there. */
function scatterProps(cell, d) {
  const r = state.propArea;
  const gap = propSpacing() / clamp(state.propDensity, 0.12, 1);
  const capacity = Math.max(1, (Math.PI * r * r) / (gap * gap));
  const tries = Math.min(600, Math.ceil(capacity * 3) + 4);
  d.rnd = d.rnd || new RNG((Date.now() ^ 0x9e3779b9) >>> 0);
  let n = 0;
  for (let i = 0; i < tries; i++) {
    if (propRoomLeft() <= 0) break;
    // sqrt, or a uniform radius piles everything up in the middle
    const a = d.rnd.range(0, Math.PI * 2), rr = Math.sqrt(d.rnd.next()) * r;
    const x = cell.fx + Math.cos(a) * rr, y = cell.fy + Math.sin(a) * rr;
    if (!state.map.inBounds(Math.floor(x), Math.floor(y))) continue;
    if (propCrowded(x, y, gap)) continue;
    placeProp({ x: Math.floor(x), y: Math.floor(y), fx: x, fy: y });
    n++;
  }
  return n;
}

/* ---------------- pointer handling ---------------- */

view.addEventListener('contextmenu', e => e.preventDefault());

view.addEventListener('pointerdown', (ev) => {
  if (!state.map) return;
  view.setPointerCapture(ev.pointerId);
  const cell = screenToCell(ev);
  // alt is the resize modifier for the Select tool, so it must not delete there
  const erasing = ev.button === 2 || (ev.altKey && state.tool !== 'select');
  const panning = ev.button === 1 || state.spaceDown || state.tool === 'pan';

  if (panning) {
    state.drag = { mode: 'pan', sx: ev.clientX, sy: ev.clientY, vx: state.view.x, vy: state.view.y };
    $('stage').classList.add('panning');
    return;
  }

  if (state.tool === 'pick') {
    const t = state.map.get(cell.x, cell.y);
    setMaterial(t);
    return;
  }

  if (erasing && (state.tool === 'edge' || state.tool === 'door')) {
    snapshot();
    state.drag = { mode: 'edge', value: EDGE.NONE };
    if (paintEdge(cell, EDGE.NONE)) refresh(true);
    return;
  }

  if (erasing) {
    snapshot();
    if (!deleteAt(cell.fx, cell.fy)) {
      applyPaint(cell, state.tool === 'wall' ? T.STONE : T.VOID);
      state.drag = { mode: 'erase-terrain' };
      refresh(true); return;
    }
    refresh(false);
    return;
  }

  switch (state.tool) {
    case 'brush':
      snapshot();
      state.drag = { mode: 'paint', mat: state.mat };
      if (applyPaint(cell, state.mat)) refresh(true);
      break;
    case 'wall':
      snapshot();
      state.drag = { mode: 'paint', mat: T.WALL, prune: true };
      if (applyPaint(cell, T.WALL)) refresh(true);
      break;
    case 'erase':
      snapshot();
      state.drag = { mode: 'erase-objects' };
      deleteAt(cell.fx, cell.fy);
      refresh(false);
      break;
    case 'capture':
      state.drag = { mode: 'capture', x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y };
      paint();
      break;
    case 'rect':
      snapshot();
      state.drag = { mode: 'rect', x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y };
      paint();
      break;
    case 'room':
      snapshot();
      state.drag = { mode: 'room', x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y };
      paint();
      break;
    case 'edge':
      snapshot();
      state.drag = { mode: 'edge', value: EDGE.WALL };
      if (paintEdge(cell, EDGE.WALL)) refresh(true);
      break;
    case 'stamp':
      snapshot();
      if (stampPrefab(cell)) { syncLightsFromProps(state.map); refresh(true); }
      else toast('That room does not fit there.', 2500);
      break;
    case 'select': {
      const hh = hitHandle(screenPos(ev).sx, screenPos(ev).sy);
      if (hh) { beginHandleDrag(hh, screenPos(ev)); break; }
      const i = pickProp(cell.fx, cell.fy);
      if (i == null) {
        // Furniture is picked before text, because a label's hit box is the
        // whole run and is often wide enough to cover half a room. Rooms come
        // last, being the largest target of the three.
        const li = pickLabel(state.map, cell.fx, cell.fy, true);
        if (li != null) {
          selectLabel(li);
          state.drag = { mode: 'label-move', i: li, offX: state.map.labels[li].x - cell.fx, offY: state.map.labels[li].y - cell.fy };
          break;
        }
        const pl = placementAt(state.map, cell.x, cell.y);
        deselectProp();
        deselectLabel();
        if (!pl) { deselectRoom(); break; }
        selectRoom(pl.id);
        state.drag = { mode: 'room-move', id: pl.id, offX: pl.x - cell.x, offY: pl.y - cell.y };
        break;
      }
      deselectRoom();
      deselectLabel();
      selectProp(i);
      const p = state.map.props[i];
      // the undo snapshot is taken lazily on the first move, so a plain
      // click-to-select doesn't fill the undo stack with no-ops
      // A grab too close to the pivot gives a meaningless angle or a huge scale
      // ratio, so the reference is deferred until the cursor is far enough out.
      const grab = Math.hypot(cell.fx - p.x, cell.fy - p.y);
      if (ev.shiftKey) {
        state.drag = {
          mode: 'prop-rotate', i, origRot: p.rot || 0,
          startAng: grab >= PIVOT_MIN ? Math.atan2(cell.fy - p.y, cell.fx - p.x) : null
        };
      } else if (ev.altKey) {
        state.drag = {
          mode: 'prop-scale', i, origScale: p.scale === undefined ? 1 : p.scale,
          startDist: grab >= PIVOT_MIN ? grab : null
        };
      } else {
        state.drag = { mode: 'prop-move', i, offX: p.x - cell.fx, offY: p.y - cell.fy };
      }
      break;
    }
    case 'prop': {
      snapshot();
      if (state.placeMode === 'scatter') {
        state.drag = { mode: 'prop-sow', lastX: cell.fx, lastY: cell.fy };
        if (scatterProps(cell, state.drag)) { syncLightsFromProps(state.map); refresh(false); }
      } else if (state.placeMode === 'many') {
        state.drag = { mode: 'prop-trail', lastX: cell.fx, lastY: cell.fy };
        placeProp(cell);
        refresh(false);
      } else {
        placeProp(cell);
        refresh(false);
      }
      break;
    }
    case 'text': {
      const li = pickLabel(state.map, cell.fx, cell.fy, true);
      if (li != null) {
        selectLabel(li);
        state.drag = { mode: 'label-move', i: li, offX: state.map.labels[li].x - cell.fx, offY: state.map.labels[li].y - cell.fy };
        break;
      }
      snapshot();
      placeLabel(cell);
      ensurePanel('right', 'labels');
      refresh(false);
      // The caret goes to the text box, because the first thing anyone wants
      // after dropping a label is to type what it says. It cannot be done from
      // here: `mousedown` runs after `pointerdown` and its default action puts
      // focus back on the canvas, so a focus set now is undone a moment later —
      // and then every letter typed is read as a tool shortcut instead, which
      // means naming a room forges a new map over it. Deferred to the click,
      // which is the last event of the gesture.
      focusLabelTextOnClick();
      break;
    }
    case 'door':
      snapshot(); placeDoor(cell); refresh(true); break;
    case 'light':
      snapshot(); placeLight(cell); refresh(false); break;
  }
});

view.addEventListener('pointermove', (ev) => {
  if (!state.map) return;
  const cell = screenToCell(ev);
  state.hover = cell;
  updateStatus(cell);
  const d = state.drag;

  if (d && d.mode === 'pan') {
    state.view.x = d.vx + (ev.clientX - d.sx);
    state.view.y = d.vy + (ev.clientY - d.sy);
    paint();
    return;
  }
  if (d && d.mode === 'paint') {
    if (applyPaint(cell, d.mat)) refresh(true);
    return;
  }
  if (d && d.mode === 'erase-terrain') {
    if (applyPaint(cell, T.VOID)) refresh(true);
    return;
  }
  if (d && d.mode === 'erase-objects') {
    if (deleteAt(cell.fx, cell.fy)) refresh(false);
    return;
  }
  if (d && (d.mode === 'rect' || d.mode === 'room' || d.mode === 'capture')) { d.x1 = cell.x; d.y1 = cell.y; paint(); return; }
  if (d && d.mode === 'edge') {
    if (paintEdge(cell, d.value)) refresh(true);
    return;
  }

  if (d && d.mode === 'handle') { applyHandleDrag(screenPos(ev), ev); return; }

  if (d && d.mode === 'label-move') {
    const l = state.map.labels[d.i];
    if (!l) return;
    if (!d.snapped) { d.snapped = true; snapshot(); }
    l.x = clamp(cell.fx + d.offX, 0, state.map.w);
    l.y = clamp(cell.fy + d.offY, 0, state.map.h);
    refresh(false);
    return;
  }
  if (d && d.mode === 'prop-trail') {
    if (trailProps(cell, d)) { syncLightsFromProps(state.map); refresh(false); }
    return;
  }
  if (d && d.mode === 'prop-sow') {
    // sow again only once the disc has moved off where it last landed, or a
    // slow drag would empty the density slider into one spot
    if (Math.hypot(cell.fx - d.lastX, cell.fy - d.lastY) >= state.propArea * 0.55) {
      d.lastX = cell.fx; d.lastY = cell.fy;
      if (scatterProps(cell, d)) { syncLightsFromProps(state.map); refresh(false); }
    }
    return;
  }

  if (d && d.mode === 'room-move') {
    const pl = state.map.placements.find(p => p.id === d.id);
    if (!pl) return;
    const nx = clamp(cell.x + d.offX, 0, state.map.w - pl.w);
    const ny = clamp(cell.y + d.offY, 0, state.map.h - pl.h);
    if (nx !== pl.x || ny !== pl.y) {
      if (!d.snapped) { d.snapped = true; snapshot(); }
      updatePlacement(state.map, pl, { x: nx, y: ny }, { connect: $('roomConnect').checked });
      syncLightsFromProps(state.map);
      syncRoomSelUI();
      refresh(true);
    }
    return;
  }

  if (d && d.mode && d.mode.indexOf('prop-') === 0) {
    const p = state.map.props[d.i];
    if (!p) return;
    const dist = Math.hypot(cell.fx - p.x, cell.fy - p.y);
    // establish the pivot reference on the first sample that is far enough out
    if (d.mode === 'prop-rotate' && d.startAng == null) {
      if (dist < PIVOT_MIN) return;
      d.startAng = Math.atan2(cell.fy - p.y, cell.fx - p.x);
      return;
    }
    if (d.mode === 'prop-scale' && d.startDist == null) {
      if (dist < PIVOT_MIN) return;
      d.startDist = dist;
      return;
    }
    if (!d.snapped) { d.snapped = true; snapshot(); }
    if (d.mode === 'prop-move') {
      p.x = clamp(cell.fx + d.offX, 0, state.map.w);
      p.y = clamp(cell.fy + d.offY, 0, state.map.h);
    } else if (d.mode === 'prop-rotate') {
      const ang = Math.atan2(cell.fy - p.y, cell.fx - p.x);
      p.rot = snapAngle(d.origRot + (ang - d.startAng));
      state.propRot = p.rot;
    } else {
      p.scale = clamp(d.origScale * (dist / d.startDist), 0.25, 4);
      state.propScale = p.scale;
    }
    syncLightsFromProps(state.map);
    syncTransformUI();
    refresh(false);
    return;
  }
  paint();
});

view.addEventListener('pointerup', (ev) => {
  const d = state.drag;
  state.drag = null;
  $('stage').classList.remove('panning');
  if (!d) return;
  if (d.mode === 'capture') { finishCapture(d); return; }
  if (d.mode === 'paint' && d.prune) {
    // partitions swallowed by solid stone are no longer walls of anything
    pruneOrphanEdges(state.map);
    refresh(true);
  }
  if (d.mode === 'rect') {
    const x0 = Math.min(d.x0, d.x1), y0 = Math.min(d.y0, d.y1);
    const x1 = Math.max(d.x0, d.x1), y1 = Math.max(d.y0, d.y1);
    state.map.fillRect(x0, y0, x1, y1, state.mat);
    refresh(true);
  }
  if (d.mode === 'room') {
    buildRoom(d.x0, d.y0, d.x1, d.y1);
    refresh(true);
  }
  if (d.mode === 'erase-terrain') {
    pruneOrphanEdges(state.map);
    refresh(true);
  }
});

view.addEventListener('pointerleave', () => { state.hover = null; paint(); });

view.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const rect = view.getBoundingClientRect();
  zoomAt(ev.clientX - rect.left, ev.clientY - rect.top, ev.deltaY < 0 ? 1.12 : 1 / 1.12);
}, { passive: false });

/* ---------------- keyboard ---------------- */

const TOOL_KEYS = {
  b: 'brush', r: 'rect', p: 'prop', d: 'door', l: 'light', w: 'wall', e: 'erase',
  h: 'pan', i: 'pick', s: 'select', v: 'select', o: 'room', k: 'edge', m: 'stamp',
  t: 'text'
};

/** Keys that act on the selected placed room. Returns true if handled. */
function handleRoomKey(k) {
  const pl = selectedRoom();
  if (!pl) return false;
  if (k === 'escape') { deselectRoom(); return true; }
  if (k === 'e') { mutateRoom({ rot: (pl.rot + 1) % 4 }); return true; }
  if (k === 'q') { mutateRoom({ rot: (pl.rot + 3) % 4 }); return true; }
  if (k === 'x') { mutateRoom({ flip: !pl.flip }); return true; }
  if (k === 'd') { duplicateRoom(); return true; }
  if (k === 'delete' || k === 'backspace') { deleteRoom(); return true; }
  return false;
}

/** Keys that act on the prop currently being edited. Returns true if handled. */
/** Keys that act on the selected label. Returns true if handled. */
function handleLabelKey(k) {
  const l = selectedLabel();
  if (!l) return false;
  if (k === 'escape') { deselectLabel(); return true; }
  if (k === 'delete' || k === 'backspace') { deleteLabel(); return true; }
  if (k === 'q' || k === 'e') {
    snapshot();
    l.rot = (l.rot || 0) + (k === 'q' ? -1 : 1) * 15 * Math.PI / 180;
    l._sig = null;
    syncLabelUI();
    refresh(false);
    return true;
  }
  if (k === 'd') { duplicateLabel(); return true; }
  if (k === '+' || k === '=' || k === '-' || k === '_') {
    snapshot();
    l.size = clamp(l.size * ((k === '-' || k === '_') ? 1 / 1.12 : 1.12), 0.2, 8);
    l._sig = null;
    syncLabelUI();
    refresh(false);
    return true;
  }
  return false;
}

function handleSelectionKey(k, ev) {
  const p = selectedProp();
  if (!p) return false;
  if (k === 'escape') { deselectProp(); return true; }
  if (k === 'delete' || k === 'backspace') {
    snapshot();
    state.map.props.splice(state.selected, 1);
    state.selected = null;
    syncLightsFromProps(state.map);
    syncTransformUI();
    refresh(false);
    return true;
  }
  const step = (state.snapDeg || 15) * Math.PI / 180;
  if (k === 'q' || k === 'e') {
    snapshot();
    state.propRot = snapAngle((p.rot || 0) + (k === 'q' ? -step : step));
    applyTransformToSelection(); syncTransformUI();
    return true;
  }
  if (k === '+' || k === '=' || k === '-' || k === '_') {
    snapshot();
    const f = (k === '-' || k === '_') ? 1 / 1.1 : 1.1;
    state.propScale = clamp(state.propScale * f, 0.25, 4);
    applyTransformToSelection(); syncTransformUI();
    return true;
  }
  return false;
}

window.addEventListener('keydown', (ev) => {
  const tag = (ev.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  const k = ev.key.toLowerCase();

  if ((ev.metaKey || ev.ctrlKey) && k === 'z') {
    ev.preventDefault();
    ev.shiftKey ? redo() : undo();
    return;
  }
  if (ev.metaKey || ev.ctrlKey) return;

  if (handleRoomKey(k)) { ev.preventDefault(); return; }
  if (handleLabelKey(k)) { ev.preventDefault(); return; }
  if (handleSelectionKey(k, ev)) { ev.preventDefault(); return; }

  // while stamping, Q/E and X turn and mirror the room instead of switching tools
  if (state.tool === 'stamp' && (k === 'x' || k === 'q' || k === 'e')) {
    ev.preventDefault();
    if (k === 'x') flipRoom();
    else rotateRoom(k === 'q' ? -1 : 1);
    return;
  }

  if (k === ' ') { state.spaceDown = true; ev.preventDefault(); return; }
  if (k === 'g') { ev.preventDefault(); generate(); return; }
  if (k === 'f') { fitView(); return; }
  if (k === 'c' && PROPS[state.prop] && PROPS[state.prop].variants) {
    setPropVariant(state.propVariant + (ev.shiftKey ? -1 : 1));
    return;
  }
  if (k === '0') { state.view.zoom = state.map.ppg / state.workPpg; updateZoomLabel(); paint(); return; }
  if (k === '[') { setBrush(state.brush - 1); return; }
  if (k === ']') { setBrush(state.brush + 1); return; }
  if (TOOL_KEYS[k]) { setTool(TOOL_KEYS[k]); return; }
});
window.addEventListener('keyup', (ev) => { if (ev.key === ' ') state.spaceDown = false; });

window.addEventListener('resize', () => {
  dpr = window.devicePixelRatio || 1;
  paint();
});

/* ---------------- the objects on a layer ----------------
   A layer holds things; this is the list of them. It is the other half of what
   Inkarnate shows next to its stack, and it earns its place for the reason any
   object list does: once a wood has thirty trees in it, "the one behind the
   rock" is findable in a list and not on the map. Selecting, hiding, locking
   and re-stacking one object all happen here rather than by hunting with the
   cursor. */

const OBJ_THUMB = 52;   // drawn big, shown at 26 — a wall torch at 26 px needs the pixels
const objThumbCache = {};

/** A small drawing of a prop, or a T for a label. Cached per prop form. */
function objThumb(o) {
  if (o.text !== undefined) {
    const c = makeCanvas(OBJ_THUMB, OBJ_THUMB);
    const x = c.getContext('2d');
    x.fillStyle = '#2a2f3c'; x.fillRect(0, 0, OBJ_THUMB, OBJ_THUMB);
    x.fillStyle = '#cfd6e4';
    x.font = '600 30px Georgia, serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('T', OBJ_THUMB / 2, OBJ_THUMB / 2 + 1);
    return c;
  }
  const def = propDefFor(PROPS[o.type], o.vi);
  if (!def) return null;
  const key = o.type + ':' + (o.vi || 0);
  if (objThumbCache[key]) return objThumbCache[key];
  const c = makeCanvas(OBJ_THUMB, OBJ_THUMB);
  const x = c.getContext('2d');
  x.fillStyle = '#2a2f3c'; x.fillRect(0, 0, OBJ_THUMB, OBJ_THUMB);
  x.save();
  x.translate(OBJ_THUMB / 2, OBJ_THUMB / 2);
  try { def.draw(x, (OBJ_THUMB - 8) / Math.max(1, def.size), seededFn(7)); } catch (e) { /* thumbnail only */ }
  x.restore();
  objThumbCache[key] = c;
  return c;
}

/** Everything on the layer being edited, labels after props, each tagged with
    the array and index the rest of the app addresses it by. */
function layerObjects(id) {
  const map = state.map, out = [];
  map.props.forEach((p, i) => { if (p.lay === id) out.push({ o: p, kind: 'prop', i }); });
  (map.labels || []).forEach((l, i) => { if (l.lay === id) out.push({ o: l, kind: 'label', i }); });
  return out;
}

function objectsPanelLayer() {
  const map = state.map;
  if (!map) return null;
  ensureLayers(map);
  const edit = layEditing == null ? null : layerById(map, layEditing);
  if (edit && edit.kind === 'objects') return edit;
  return layerById(map, activeLayerId(activeLayerKind()));
}

let objListSig = null;

function buildObjectsPanel(force) {
  const host = $('objList');
  if (!host || !state.map) return;
  const L = objectsPanelLayer();
  const q = ($('objSearch').value || '').trim().toLowerCase();
  const all = L ? layerObjects(L.id) : [];
  const rows = q ? all.filter(e => objLabel(e.o).toLowerCase().includes(q)) : all;

  const sig = (L ? L.id + L.name : '-') + '|' + q + '|' + state.selected + '|' + state.selLabel + '|' +
    all.map(e => objLabel(e.o) + (e.o.hid ? 'h' : '') + (e.o.lk ? 'l' : '') + objSub(e.o)).join(',');
  if (!force && sig === objListSig) return;
  objListSig = sig;

  $('objLayerNote').textContent = L
    ? all.length + (all.length === 1 ? ' thing on ' : ' things on ') + L.name
    : 'Pick an object layer in the Layers panel.';
  host.textContent = '';

  if (!rows.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.style.margin = '10px 2px';
    p.textContent = all.length ? 'Nothing here matches.' : 'Nothing on this layer yet.';
    host.appendChild(p);
    syncObjSelBox();
    return;
  }

  // Topmost first, the way the stack above it reads. Props and labels are
  // numbered in their own arrays, so the index alone would sort label 0 under
  // prop 40; the kind has to break the tie first, and labels draw last.
  const rank = (e) => (e.kind === 'label' ? 1 : 0);
  rows.sort((a, b) => objSub(b.o) - objSub(a.o) || rank(b) - rank(a) || b.i - a.i);

  for (const e of rows) {
    const row = document.createElement('div');
    row.className = 'objrow';
    const sel = (e.kind === 'prop' && state.selected === e.i) ||
                (e.kind === 'label' && state.selLabel === e.i);
    if (sel) row.classList.add('active');
    if (e.o.hid) row.classList.add('hidden');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');

    const eye = document.createElement('button');
    eye.className = 'laytoggle';
    eye.innerHTML = '<i data-icon="' + (e.o.hid ? 'eyeoff' : 'eye') + '"></i>';
    eye.title = e.o.hid ? 'Show this' : 'Hide this';
    eye.addEventListener('click', (ev) => { ev.stopPropagation(); toggleObjFlag(e, 'hid'); });

    const thumb = objThumb(e.o);
    const name = document.createElement('span');
    name.className = 'objname';
    if (thumb) { thumb.className = 'objthumb'; name.appendChild(thumb); }
    const t = document.createElement('b');
    t.textContent = objLabel(e.o);
    name.appendChild(t);
    if (objSub(e.o)) {
      const sub = document.createElement('em');
      sub.textContent = objSub(e.o) > 0 ? '+' + objSub(e.o) : String(objSub(e.o));
      sub.title = 'Sublayer ' + objSub(e.o);
      name.appendChild(sub);
    }

    const lock = document.createElement('button');
    lock.className = 'laytoggle' + (e.o.lk ? ' on' : '');
    lock.innerHTML = '<i data-icon="' + (e.o.lk ? 'lock' : 'unlock') + '"></i>';
    lock.title = e.o.lk ? 'Unlock this' : 'Lock this so the cursor ignores it';
    lock.addEventListener('click', (ev) => { ev.stopPropagation(); toggleObjFlag(e, 'lk'); });

    row.append(eye, name, lock);
    const choose = () => selectFromObjectList(e);
    row.addEventListener('click', choose);
    row.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choose(); }
    });
    host.appendChild(row);
  }
  renderIcons(host);
  syncObjSelBox();
}

/** Clicking a row selects that object on the map and shows you where it is. */
function selectFromObjectList(e) {
  if (e.o.hid || e.o.lk) { toast(e.o.hid ? 'That one is hidden.' : 'That one is locked.'); return; }
  if (e.kind === 'prop') {
    deselectLabel(); deselectRoom();
    setTool('select');
    selectProp(e.i);
  } else {
    deselectProp(); deselectRoom();
    setTool('text');
    selectLabel(e.i);
  }
  centreOn(e.o.x, e.o.y);
  buildObjectsPanel(true);
  paint();
}

/** Bring a point to the middle of the view, but only when it is off screen —
    a list click should not yank the map about when you can already see it. */
function centreOn(fx, fy) {
  const s = state.workPpg * state.view.zoom;
  const sx = fx * s + state.view.x, sy = fy * s + state.view.y;
  const w = view.clientWidth, h = view.clientHeight, m = 40;
  if (sx >= m && sx <= w - m && sy >= m && sy <= h - m) return;
  state.view.x = w / 2 - fx * s;
  state.view.y = h / 2 - fy * s;
}

function toggleObjFlag(e, flag) {
  snapshot();
  const o = e.o;
  o[flag] = !o[flag];
  if (!o[flag]) delete o[flag];   // absent is the common case; keep it out of the file
  if (o.hid || o.lk) {
    if (e.kind === 'prop' && state.selected === e.i) deselectProp();
    if (e.kind === 'label' && state.selLabel === e.i) deselectLabel();
  }
  syncLightsFromProps(state.map);
  buildObjectsPanel(true);
  refresh(false);
}

/** The header buttons act on everything the list is currently showing, so a
    search term narrows what they touch. */
function objBulk(flag) {
  const L = objectsPanelLayer();
  if (!L) return;
  const q = ($('objSearch').value || '').trim().toLowerCase();
  let rows = layerObjects(L.id);
  if (q) rows = rows.filter(e => objLabel(e.o).toLowerCase().includes(q));
  if (!rows.length) return;
  snapshot();
  const on = !rows.every(e => e.o[flag]);   // all on already means turn them off
  for (const e of rows) { if (on) e.o[flag] = true; else delete e.o[flag]; }
  deselectProp(); deselectLabel();
  syncLightsFromProps(state.map);
  buildObjectsPanel(true);
  refresh(false);
}

function selectedObjectEntry() {
  if (state.selected != null && state.map.props[state.selected])
    return { o: state.map.props[state.selected], kind: 'prop', i: state.selected };
  if (state.selLabel != null && state.map.labels[state.selLabel])
    return { o: state.map.labels[state.selLabel], kind: 'label', i: state.selLabel };
  return null;
}

function syncObjSelBox() {
  const e = selectedObjectEntry();
  $('objSelBox').classList.toggle('on', !!e);
  if (!e) return;
  $('objSub').value = objSub(e.o);
  $('objSubLbl').textContent = objSub(e.o);
}

function applyObjSub() {
  const e = selectedObjectEntry();
  if (!e) return;
  const v = parseInt($('objSub').value, 10) || 0;
  if (objSub(e.o) === v) return;
  snapshot();
  if (v) e.o.sub = v; else delete e.o.sub;
  $('objSubLbl').textContent = v;
  buildObjectsPanel(true);
  refresh(false);
}

function setupObjectsPanel() {
  $('objSearch').addEventListener('input', () => buildObjectsPanel(true));
  $('objHideAll').addEventListener('click', () => objBulk('hid'));
  $('objLockAll').addEventListener('click', () => objBulk('lk'));
  $('objSub').addEventListener('input', applyObjSub);
}

/* ---------------- the layer stack ----------------
   The panel reads top-down, the way a stack of sheets on a desk does, while
   map.layers is stored bottom-first in drawing order. Every index that crosses
   between the two gets flipped, and the flip lives here so nothing else has to
   think about it. */

function activeLayerId(kind) {
  const map = state.map;
  if (!map) return 0;
  ensureLayers(map);
  const want = state.activeLay[kind];
  const L = layerById(map, want);
  if (L && L.kind === 'objects' && L.visible && !L.locked) return L.id;
  // fall back to the layer that kind is shipped on, then to anything usable
  const home = layerById(map, kind === 'label' ? DEFAULT_LABEL_LAYER : DEFAULT_PROP_LAYER);
  const usable = (x) => x && x.visible && !x.locked;
  const pick = usable(home) ? home : objectLayers(map).find(usable) || objectLayers(map)[0];
  state.activeLay[kind] = pick.id;
  return pick.id;
}

/** Which kind of object the current tool makes, so the panel can highlight the
    layer that tool is about to write to rather than a single global one. */
function activeLayerKind() { return state.tool === 'text' ? 'label' : 'prop'; }

/* Clicking a row claims it for the tool in hand. `both` is for a layer the user
   has just made on purpose: they want to work in it whatever they pick up next,
   and having the note they write land on some other layer because the Text tool
   still points at the old one is the kind of thing nobody forgives twice. */
function setActiveLayer(id, both) {
  const L = layerById(state.map, id);
  if (!L || L.kind !== 'objects') return;
  if (both) { state.activeLay.prop = id; state.activeLay.label = id; }
  else state.activeLay[activeLayerKind()] = id;
  state.map.curLay = activeLayerId('prop');
  buildLayerPanel();
}

let layEditing = null;   // id of the layer whose settings are open
let layerSig = null;

/* Called from refresh, so it runs on every drag frame. Rebuilding a dozen rows
   that often is wasteful and it makes the drag-to-reorder let go, so the DOM is
   only touched when something the panel actually shows has changed. */
function layerPanelSig(map, activeId) {
  const parts = [activeId, layEditing];
  for (const L of map.layers) {
    const c = L.kind === 'objects' ? layerCounts(map, L.id).total : 0;
    parts.push(L.id, L.kind, L.name, L.visible ? 1 : 0, L.locked ? 1 : 0, c);
  }
  return parts.join('|');
}

function buildLayerPanel(force) {
  const map = state.map;
  const host = $('layerList');
  if (!map || !host) return;
  ensureLayers(map);
  map.curLay = activeLayerId('prop');
  const activeId = activeLayerId(activeLayerKind());
  if (layEditing != null && !layerById(map, layEditing)) layEditing = null;
  const sig = layerPanelSig(map, activeId);
  if (!force && sig === layerSig) { syncLayerBox(); return; }
  layerSig = sig;
  host.textContent = '';

  // top of the stack first
  for (let i = map.layers.length - 1; i >= 0; i--) {
    const L = map.layers[i];
    const kind = LAYER_KINDS[L.kind];
    const row = document.createElement('div');
    row.className = 'layerrow';
    row.dataset.id = L.id;
    if (L.id === layEditing) row.classList.add('editing');
    if (L.kind === 'objects' && L.id === activeId) row.classList.add('active');
    if (!L.visible) row.classList.add('hidden');
    if (kind.pinned) row.classList.add('pinned');
    if (!kind.pinned) {
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', L.name + ' layer. Alt with the arrow keys moves it.');
      row.addEventListener('keydown', (ev) => layerRowKey(ev, L.id));
    }

    const eye = document.createElement('button');
    eye.className = 'laytoggle';
    eye.innerHTML = '<i data-icon="' + (L.visible ? 'eye' : 'eyeoff') + '"></i>';
    eye.title = L.visible ? 'Hide this layer' : 'Show this layer';
    eye.addEventListener('click', (ev) => { ev.stopPropagation(); toggleLayerVisible(L.id); });

    const name = document.createElement('span');
    name.className = 'layname';
    const counts = layerCounts(map, L.id);
    name.innerHTML = '<i data-icon="' + kind.icon + '"></i><b>' + escapeHtml(L.name) + '</b>' +
      (L.kind === 'objects' ? '<em>' + counts.total + '</em>' : '');

    const lock = document.createElement('button');
    lock.className = 'laytoggle' + (L.locked ? ' on' : '');
    lock.innerHTML = '<i data-icon="' + (L.locked ? 'lock' : 'unlock') + '"></i>';
    lock.title = L.locked ? 'Unlock this layer' : 'Lock this layer so the cursor ignores it';
    lock.disabled = kind.pinned && L.kind !== 'terrain';
    lock.addEventListener('click', (ev) => { ev.stopPropagation(); toggleLayerLocked(L.id); });

    row.append(eye, name, lock);
    row.addEventListener('click', () => {
      layEditing = L.id;
      if (L.kind === 'objects') setActiveLayer(L.id); else buildLayerPanel();
      syncLayerBox();
      buildObjectsPanel(true);
    });
    host.appendChild(row);
  }
  wireLayerDrag(host);
  renderIcons(host);
  syncLayerBox();
  $('layAdd').disabled = map.layers.length >= LAYER_MAX;
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* The three toggles that are also Appearance checkboxes drive the checkbox as
   well, so the two places that show the same fact can never disagree. */
const LAYER_MIRROR = { grid: 'optGrid' };

function toggleLayerVisible(id) {
  const L = layerById(state.map, id);
  if (!L) return;
  snapshot();
  L.visible = !L.visible;
  const box = LAYER_MIRROR[L.kind];
  if (box) $(box).checked = L.visible;
  // a hidden layer's torches stop burning, so the light list has to be rebuilt
  syncLightsFromProps(state.map);
  buildLayerPanel();
  refresh(true);
}

function toggleLayerLocked(id) {
  const L = layerById(state.map, id);
  if (!L) return;
  L.locked = !L.locked;
  if (L.locked) {
    // nothing on a locked layer should stay selected, or its handles would
    // still be draggable on a layer that is meant to be out of the way
    if (state.selected != null && state.map.props[state.selected] &&
        state.map.props[state.selected].lay === id) deselectProp();
    if (state.selLabel != null && state.map.labels[state.selLabel] &&
        state.map.labels[state.selLabel].lay === id) deselectLabel();
  }
  buildLayerPanel();
  paint();
}

function syncLayerBox() {
  const box = $('layerBox');
  const L = layEditing == null ? null : layerById(state.map, layEditing);
  box.classList.toggle('on', !!L);
  if (!L) return;
  const kind = LAYER_KINDS[L.kind];
  $('layEditName').textContent = L.name;
  $('layName').value = L.name;
  $('layName').disabled = kind.unique;
  $('layOpacity').value = L.opacity;
  $('layOpacityLbl').textContent = Math.round(L.opacity * 100) + '%';
  $('layBlend').value = L.blend || 'normal';
  // blend has no meaning for a layer that has no pixels of its own, and the
  // terrain has nothing beneath it to blend with
  const canBlend = !kind.filter && L.kind !== 'terrain';
  $('layBlendField').style.display = canBlend ? '' : 'none';
  // the effects row's strengths live in Appearance, each with its own slider;
  // a second one here would be a third way to say the same thing
  const canFade = L.kind !== 'effects';
  $('layOpacity').closest('.field').style.display = canFade ? '' : 'none';
  $('layDelete').disabled = kind.pinned ||
    (L.kind === 'objects' && objectLayers(state.map).length <= 1);
  $('layMerge').disabled = L.kind !== 'objects';
  $('laySelMove').disabled = L.kind !== 'objects' || (state.selected == null && state.selLabel == null);
  $('layBlurb').textContent = kind.filter && L.kind !== 'effects'
    ? kind.blurb + ' Opacity is how strong it is.'
    : kind.blurb;
}

function applyLayerEdits() {
  const L = layEditing == null ? null : layerById(state.map, layEditing);
  if (!L) return;
  const kind = LAYER_KINDS[L.kind];
  if (!kind.unique) L.name = $('layName').value.trim() || L.name;
  if (L.kind !== 'effects') L.opacity = num('layOpacity');
  L.blend = $('layBlend').value;
  $('layOpacityLbl').textContent = Math.round(L.opacity * 100) + '%';
  $('layEditName').textContent = L.name;
  buildLayerPanel();
  refresh(false);
}

/** Move the selected prop or label onto the layer whose settings are open. */
function moveSelectionToLayer() {
  const L = layEditing == null ? null : layerById(state.map, layEditing);
  if (!L || L.kind !== 'objects') return;
  const o = state.selected != null ? state.map.props[state.selected]
    : state.selLabel != null ? state.map.labels[state.selLabel] : null;
  if (!o) return;
  snapshot();
  o.lay = L.id;
  syncLightsFromProps(state.map);
  buildLayerPanel();
  refresh(false);
  toast('Moved to ' + L.name + '.');
}

/** Show only this layer, or put everything back if it is already the only one
    showing — the same key people expect from an image editor. */
function soloLayer() {
  const map = state.map;
  if (layEditing == null) return;
  snapshot();
  const others = map.layers.filter(L => L.id !== layEditing);
  const alone = others.every(L => !L.visible);
  for (const L of others) L.visible = alone;
  const target = layerById(map, layEditing);
  if (target) target.visible = true;
  for (const kind in LAYER_MIRROR) {
    const L = layerOfKind(map, kind);
    if (L) $(LAYER_MIRROR[kind]).checked = L.visible;
  }
  syncLightsFromProps(map);
  buildLayerPanel();
  refresh(true);
}

/* Rows are dragged rather than nudged with arrows, because a stack is a spatial
   thing and people already know how to reorder one. Pointer events rather than
   HTML5 drag-and-drop: the same code then serves mouse and touch, the drop
   indicator is ours to draw, and — the part that decides it — a row can also be
   moved from the keyboard, which native dragging has never offered. The terrain
   refuses both to move and to be dropped past, so it stays the floor. */
function wireLayerDrag(host) {
  let drag = null;

  const rowAt = (clientY) => {
    for (const r of host.querySelectorAll('.layerrow')) {
      const b = r.getBoundingClientRect();
      if (clientY >= b.top && clientY <= b.bottom) return { row: r, above: clientY < b.top + b.height / 2 };
    }
    return null;
  };
  const clearMarks = () => {
    for (const r of host.querySelectorAll('.layerrow')) r.classList.remove('dropbefore', 'dropafter');
  };

  host.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const row = ev.target.closest('.layerrow');
    if (!row || row.classList.contains('pinned')) return;
    if (ev.target.closest('.laytoggle')) return;   // the eye and the lock are not handles
    drag = { id: parseInt(row.dataset.id, 10), row, y0: ev.clientY, moved: false };
  });

  host.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    // a few pixels of slop, so a click that wobbles still reads as a click
    if (!drag.moved) {
      if (Math.abs(ev.clientY - drag.y0) < 4) return;
      drag.moved = true;
      drag.row.classList.add('dragging');
      host.setPointerCapture(ev.pointerId);
    }
    clearMarks();
    const hit = rowAt(ev.clientY);
    if (hit && !hit.row.classList.contains('pinned')) {
      hit.row.classList.add(hit.above ? 'dropbefore' : 'dropafter');
    }
  });

  const finish = (ev) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    clearMarks();
    d.row.classList.remove('dragging');
    if (host.hasPointerCapture && host.hasPointerCapture(ev.pointerId)) host.releasePointerCapture(ev.pointerId);
    if (!d.moved) return;
    // a drag is not a click; the row must not also become the active layer
    host.addEventListener('click', (e) => e.stopPropagation(), { capture: true, once: true });
    const hit = rowAt(ev.clientY);
    if (!hit || hit.row.classList.contains('pinned')) return;
    const overId = parseInt(hit.row.dataset.id, 10);
    if (overId === d.id) return;
    dropLayer(d.id, overId, hit.above);
  };
  host.addEventListener('pointerup', finish);
  host.addEventListener('pointercancel', finish);
}

/** Put `id` next to `overId`. `above` is above *in the panel*, which is higher
    in the stack, because the list is drawn top-down over an array stored
    bottom-up. */
function dropLayer(id, overId, above) {
  const map = state.map;
  snapshot();
  const from = layerIndex(map, id);
  let to = layerIndex(map, overId) + (above ? 1 : 0);
  if (from < to) to--;
  if (!reorderLayer(map, id, to)) { state.undo.pop(); updateUndoButtons(); return; }
  buildLayerPanel(true);
  refresh(false);
}

/** Alt with the arrow keys moves the focused row, which is the only way to
    reorder the stack without a pointer. */
function layerRowKey(ev, id) {
  const dir = ev.key === 'ArrowUp' ? 1 : ev.key === 'ArrowDown' ? -1 : 0;
  if (dir && ev.altKey) {
    ev.preventDefault();
    snapshot();
    if (!moveLayer(state.map, id, dir)) { state.undo.pop(); updateUndoButtons(); return; }
    buildLayerPanel(true);
    refresh(false);
    // the row moved out from under the focus ring; put it back on the same layer
    const again = document.querySelector('.layerrow[data-id="' + id + '"]');
    if (again) again.focus();
    return;
  }
  if (dir) {
    ev.preventDefault();
    const rows = [...document.querySelectorAll('.layerrow')];
    const i = rows.findIndex(r => parseInt(r.dataset.id, 10) === id);
    const next = rows[i + (dir > 0 ? -1 : 1)];
    if (next) next.focus();
    return;
  }
  if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.currentTarget.click(); }
}

function setupLayerPanel() {
  const sel = $('layBlend');
  for (const b of LAYER_BLENDS) {
    const o = document.createElement('option');
    o.value = b.key; o.textContent = b.label;
    sel.appendChild(o);
  }
  $('layName').addEventListener('input', applyLayerEdits);
  $('layOpacity').addEventListener('input', applyLayerEdits);
  sel.addEventListener('change', applyLayerEdits);
  $('layAdd').addEventListener('click', () => {
    snapshot();
    const L = addObjectLayer(state.map, null, layEditing);
    if (!L) { toast('That is as deep as the stack goes.'); return; }
    layEditing = L.id;
    setActiveLayer(L.id, true);
    buildLayerPanel(true);
    refresh(false);
  });
  $('layMerge').addEventListener('click', () => {
    if (layEditing == null) return;
    snapshot();
    const into = mergeLayerDown(state.map, layEditing);
    if (!into) { toast('There is no object layer below this one.'); return; }
    layEditing = into.id;
    buildLayerPanel();
    refresh(false);
  });
  $('layDelete').addEventListener('click', () => {
    if (layEditing == null) return;
    const L = layerById(state.map, layEditing);
    if (!L) return;
    const n = layerCounts(state.map, L.id).total;
    if (n && !confirm('Delete "' + L.name + '" and the ' + n + ' thing' + (n === 1 ? '' : 's') + ' on it?')) return;
    snapshot();
    deselectProp(); deselectLabel();
    if (!removeLayer(state.map, L.id)) { toast('That layer cannot be deleted.'); return; }
    layEditing = null;
    syncLightsFromProps(state.map);
    buildLayerPanel();
    refresh(true);
  });
  $('laySelMove').addEventListener('click', moveSelectionToLayer);
  $('layIsolate').addEventListener('click', soloLayer);
}

/* ---------------- panel construction ---------------- */

function buildTypeSelect() {
  const sel = $('mapType');
  const groups = {};
  for (const key in GENERATORS) {
    const g = GENERATORS[key];
    (groups[g.group] = groups[g.group] || []).push(g);
  }
  for (const gname of ['Interior', 'Underground', 'Wilderness', 'Settlement', 'Structure', 'Blank']) {
    if (!groups[gname]) continue;
    const og = document.createElement('optgroup');
    og.label = gname;
    for (const g of groups[gname]) {
      const o = document.createElement('option');
      o.value = g.key; o.textContent = g.label;
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
  sel.value = 'dungeon';
}

const PALETTE_ORDER = [
  T.STONE, T.COBBLE, T.WOOD, T.BRIDGE, T.CARPET, T.DIRT, T.GRASS, T.MOSS,
  T.SAND, T.SNOW, T.ICE, T.MUD, T.ASH, T.RUBBLE, T.WATER, T.DEEP,
  T.LAVA, T.CHASM, T.SKY, T.CLOUD, T.WALL, T.WALL_WOOD, T.ROCK, T.SANDSTONE, T.ROCK_ICE, T.VOID
];

const SHORT_NAMES = {
  stone: 'Flags', cobble: 'Cobble', wood: 'Planks', bridge: 'Bridge', carpet: 'Carpet',
  dirt: 'Dirt', grass: 'Grass', moss: 'Moss', sand: 'Sand', snow: 'Snow', ice: 'Ice',
  mud: 'Mud', ash: 'Ash', rubble: 'Rubble', water: 'Shallow', deep: 'Deep', lava: 'Lava',
  chasm: 'Chasm', wall: 'Wall', wallw: 'Timber', rock: 'Cave', sstone: 'Sandst.',
  irock: 'Frozen', sky: 'Sky', cloud: 'Cloud', void: 'Void'
};

/** The picker cells are divs, so the browser gives them none of a button's
    behaviour — no tab stop, no Enter, no name. This lends them all three
    without changing the markup the layout depends on. */
function asButton(el, label, onActivate) {
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', label);
  el.addEventListener('click', onActivate);
  el.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onActivate(); }
  });
}

function buildSwatches() {
  const box = $('swatches');
  box.innerHTML = '';
  for (const id of PALETTE_ORDER) {
    const mat = MATS[id];
    const el = document.createElement('div');
    el.className = 'swatch' + (id === state.mat ? ' active' : '');
    el.dataset.mat = id;
    el.title = mat.label;
    el.style.background = `linear-gradient(135deg, ${rgb(mat.c2)}, ${rgb(mat.c1)})`;
    const lbl = document.createElement('span');
    lbl.textContent = SHORT_NAMES[mat.key] || mat.label.split(' ')[0];
    el.appendChild(lbl);
    el.setAttribute('aria-pressed', id === state.mat ? 'true' : 'false');
    asButton(el, mat.label, () => setMaterial(id));
    box.appendChild(el);
  }
}

function setMaterial(id) {
  if (!MATS[id]) return;
  state.mat = id;
  for (const el of document.querySelectorAll('.swatch')) {
    const on = +el.dataset.mat === id;
    el.classList.toggle('active', on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  if (state.tool === 'pick') setTool('brush');
}

/** Match on label and category, so "light" finds the category and "chandelier"
    the item. A search spans every category — that's the point of searching. */
function pickerMatch(def, q) {
  if (!q) return true;
  const hay = (def.label + ' ' + def.cat + ' ' + def.key).toLowerCase();
  return q.split(/\s+/).every(w => hay.indexOf(w) >= 0);
}

function buildPropPanel() {
  const q = ($('propSearch').value || '').trim().toLowerCase();
  const tabs = $('propTabs');
  tabs.innerHTML = '';
  tabs.style.display = q ? 'none' : '';
  for (const cat of PROP_CATEGORIES) {
    const b = document.createElement('button');
    b.textContent = cat;
    b.className = cat === state.propCat ? 'active' : '';
    b.addEventListener('click', () => { state.propCat = cat; buildPropPanel(); });
    tabs.appendChild(b);
  }
  const grid = $('propGrid');
  grid.innerHTML = '';
  let shown = 0;
  for (const def of PROP_LIST) {
    if (q ? !pickerMatch(def, q) : def.cat !== state.propCat) continue;
    shown++;
    const cell = document.createElement('div');
    cell.className = 'propcell' + (def.key === state.prop ? ' active' : '');
    cell.title = def.label;
    const c = makeCanvas(52, 52);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2a2f3c'; ctx.fillRect(0, 0, 52, 52);
    ctx.save();
    ctx.translate(26, 26);
    // `shown` is the loop's counter — this is the form to draw
    const thumb = def.key === state.prop ? propDefFor(def, state.propVariant) : def;
    const u = 44 / Math.max(1, thumb.size);
    ctx.scale(1, 1);
    try { thumb.draw(ctx, u, seededFn(7)); } catch (e) { /* thumbnail only */ }
    ctx.restore();
    cell.appendChild(c);
    cell.setAttribute('aria-pressed', def.key === state.prop ? 'true' : 'false');
    asButton(cell, def.label, () => {
      if (def.key !== state.prop) state.propVariant = 0;
      state.prop = def.key;
      setTool('prop');
      buildPropPanel();
    });
    grid.appendChild(cell);
  }
  if (!shown) {
    const p = document.createElement('p');
    p.className = 'pickerempty';
    p.textContent = q ? 'No props match “' + q + '”.' : 'Nothing in this category yet.';
    grid.appendChild(p);
  }
  buildVariantRow();
  drawPropPreview();
}

/** Thumbnails are real renders of a one-room map, so they always match output. */
const roomThumbCache = {};
function roomThumbnail(key) {
  if (roomThumbCache[key]) return roomThumbCache[key];
  const def = ROOMS[key];
  const pad = 1;
  const m = new GameMap(def.w + pad * 2, def.h + pad * 2, 22);
  m.seed = 'thumb-' + key;
  m.fill(T.VOID);
  stampRoom(m, key, pad, pad);
  syncLightsFromProps(m);
  const cv = renderMap(m, Object.assign(defaultRenderOpts(), {
    grid: false, lighting: true, ambient: 0.3, vignette: false, shadows: true
  }));
  roomThumbCache[key] = cv;
  return cv;
}

function buildRoomPanel() {
  const q = ($('roomSearch').value || '').trim().toLowerCase();
  const tabs = $('roomTabs');
  tabs.innerHTML = '';
  tabs.style.display = q ? 'none' : '';
  for (const cat of ROOM_CATEGORIES) {
    const b = document.createElement('button');
    b.textContent = cat;
    b.className = cat === state.roomCat ? 'active' : '';
    b.addEventListener('click', () => { state.roomCat = cat; buildRoomPanel(); });
    tabs.appendChild(b);
  }
  const grid = $('roomGrid');
  grid.innerHTML = '';
  let shown = 0;
  for (const def of ROOM_LIST) {
    if (q ? !pickerMatch(def, q) : def.cat !== state.roomCat) continue;
    shown++;
    const cell = document.createElement('div');
    cell.className = 'roomcell' + (def.key === state.roomKey ? ' active' : '');
    cell.title = def.label + ' — ' + def.w + '×' + def.h + ' squares';
    const img = roomThumbnail(def.key);
    const c = makeCanvas(img.width, img.height);
    c.getContext('2d').drawImage(img, 0, 0);
    const label = document.createElement('span');
    label.textContent = def.label;
    cell.appendChild(c);
    cell.appendChild(label);
    cell.setAttribute('aria-pressed', def.key === state.roomKey ? 'true' : 'false');
    asButton(cell, def.label + ', ' + def.w + ' by ' + def.h + ' squares', () => {
      state.roomKey = def.key;
      setTool('stamp');
      buildRoomPanel();
    });
    grid.appendChild(cell);
  }
  if (!shown) {
    const p = document.createElement('p');
    p.className = 'pickerempty';
    p.textContent = q ? 'No rooms match “' + q + '”.' : 'Nothing in this category yet.';
    grid.appendChild(p);
  }
  updateOrientationLabel();
}

const TOOL_PANEL = {
  brush: 'terrain', rect: 'terrain', room: 'terrain', wall: 'terrain',
  prop: 'props', stamp: 'prefabs', edge: 'tools', pick: 'terrain', text: 'labels'
};

function setTool(tool) {
  const changed = state.tool !== tool;
  state.tool = tool;
  if (changed && TOOL_PANEL[tool] && panelState.right) ensurePanel('right', TOOL_PANEL[tool]);
  for (const b of document.querySelectorAll('#toolGrid button')) {
    const on = b.dataset.tool === tool;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  if (tool !== 'select') {
    if (state.selected != null) { state.selected = null; syncTransformUI(); }
    if (state.selRoomId != null) { state.selRoomId = null; syncRoomSelUI(); }
    // the Label tool keeps its own selection, since editing the thing you just
    // wrote is the whole point of it
    if (tool !== 'text' && state.selLabel != null) { state.selLabel = null; syncLabelUI(); }
  }
  // the Text tool writes to a different layer than the Prop tool, so the row
  // marked as the one receiving new work has to follow the tool
  if (changed) buildLayerPanel();
  paint();
}

function setBrush(v) {
  state.brush = clamp(Math.round(v), 1, 12);
  $('brushSize').value = state.brush;
  $('brushLbl').textContent = state.brush;
  paint();
}

/* ---------------- rails and flyout panels ----------------
   Each side is an icon rail plus one panel that shows a single section at a
   time. Clicking the open section's icon shuts the panel entirely, which is
   the point: the canvas gets the space back. */

const PANEL_STATE_KEY = 'battlemapforge.panels.v1';
const panelState = { left: 'generate', right: 'terrain' };

function panelOf(side) { return $(side === 'left' ? 'leftPanel' : 'rightPanel'); }

function showPanel(side, name) {
  const panel = panelOf(side);
  const same = panelState[side] === name;
  panelState[side] = same ? null : name;

  // where the canvas sits on screen right now: opening or shutting the left
  // panel shifts that edge, and the map must not ride along with it
  const before = view.getBoundingClientRect();

  panel.classList.toggle('shut', !panelState[side]);
  for (const sec of panel.querySelectorAll('section.group'))
    sec.classList.toggle('showing', sec.dataset.group === panelState[side]);
  for (const b of document.querySelectorAll('.rail > button[data-panel]'))
    if (b.dataset.side === side) {
      const on = b.dataset.panel === panelState[side];
      b.classList.toggle('open', on);
      b.setAttribute('aria-expanded', on ? 'true' : 'false');
    }

  try { localStorage.setItem(PANEL_STATE_KEY, JSON.stringify(panelState)); } catch (e) { }

  // the stage changed width; counter-shift the pan so the map keeps the same
  // spot on screen instead of sliding with the canvas edge
  const after = view.getBoundingClientRect();
  if (state.cache) {
    state.view.x += before.left - after.left;
    state.view.y += before.top - after.top;
  }

  requestAnimationFrame(() => { paint(); updateFloatBar(); });
}

/** Open a panel without toggling it shut if it is already open. */
function ensurePanel(side, name) {
  if (panelState[side] !== name) showPanel(side, name);
}

function setupPanels() {
  try {
    const saved = JSON.parse(localStorage.getItem(PANEL_STATE_KEY) || 'null');
    if (saved) { panelState.left = saved.left; panelState.right = saved.right; }
  } catch (e) { }
  for (const b of document.querySelectorAll('.rail > button[data-panel]'))
    b.addEventListener('click', () => showPanel(b.dataset.side, b.dataset.panel));

  // The header shuts that side. The ✕ inside it is a real button so the panel
  // can also be closed from the keyboard; it stops the header handler firing
  // twice on the same click.
  for (const sec of document.querySelectorAll('section.group')) {
    const h2 = sec.querySelector('h2');
    if (!h2) continue;
    const side = sec.closest('#leftPanel') ? 'left' : 'right';
    h2.addEventListener('click', () => showPanel(side, panelState[side]));
    const chev = h2.querySelector('.chev');
    if (chev) chev.addEventListener('click', ev => {
      ev.stopPropagation();
      showPanel(side, panelState[side]);
    });
  }

  // apply the remembered state
  for (const side of ['left', 'right']) {
    const want = panelState[side];
    panelState[side] = null;
    if (want) showPanel(side, want); else showPanel(side, null);
  }
}

/* ---------------- status & stats ---------------- */

function updateStatus(cell) {
  if (!state.map) return;
  const inside = state.map.inBounds(cell.x, cell.y);
  const t = inside ? state.map.get(cell.x, cell.y) : null;
  $('statusbar').textContent = inside
    ? `${cell.x}, ${cell.y}  ·  ${MATS[t].label}  ·  ${state.map.w}×${state.map.h} squares (${state.map.w * 5}×${state.map.h * 5} ft)`
    : `${state.map.w}×${state.map.h} squares (${state.map.w * 5}×${state.map.h * 5} ft)`;
}

function updateStats() {
  const map = state.map;
  if (!map) return;
  const ppg = parseInt($('exportPpg').value, 10);
  const px = `${map.w * ppg} × ${map.h * ppg} px`;
  const segs = extractWalls(map, { border: $('expBorder').checked, props: $('expPropWalls').checked });
  const rooms = findRooms(map).filter(r => r.enclosed && r.area > 1);
  const doorCount = map.doors.length + edgePortals(map).length;
  $('statsBox').innerHTML =
    `Size: <b>${map.w} × ${map.h}</b> squares (${map.w * 5} × ${map.h * 5} ft)<br>` +
    `Props: <b>${map.props.length}</b> · Doors: <b>${doorCount}</b> · Lights: <b>${map.lights.length}</b>` +
    (map.labels && map.labels.length ? ` · Labels: <b>${map.labels.length}</b>` : '') + '<br>' +
    `Enclosed rooms: <b>${rooms.length}</b> · Partition runs: <b>${extractEdgeWalls(map).length}</b><br>` +
    `Wall segments: <b>${segs.length}</b><br>Seed: <b>${map.seed}</b>`;
  $('expInfo').innerHTML = `Image will be <b>${px}</b>. Universal VTT and Foundry exports use the same resolution, so walls line up exactly.`;
  $('helpDims').textContent = `${map.w} × ${map.h}`;
  $('wLbl').textContent = map.w; $('hLbl').textContent = map.h;
  updateZoomLabel();
}

/* ---------------- generate ---------------- */

/* Each map type reads a different set of knobs. Show only the ones that do
   something, named for what they do to *this* kind of map. */
const KNOB_IDS = {
  density: 'density', complexity: 'complexity', water: 'water',
  lava: 'lava', props: 'props'
};

function applyKnobSchema() {
  const g = GENERATORS[$('mapType').value];
  const knobs = (g && g.knobs) || {};
  let shown = 0;
  for (const key in KNOB_IDS) {
    const row = $('knob-' + key);
    if (!row) continue;
    const label = knobs[key];
    row.classList.toggle('knob-off', !label);
    if (label) {
      row.querySelector('.knobName').textContent = label;
      shown++;
    }
  }
  $('knobNote').textContent = shown
    ? ''
    : 'This map type takes no settings — just reroll the seed.';
}

function cfgFromUI() {
  return {
    type: $('mapType').value,
    seed: $('seed').value || 'forge',
    w: clamp(parseInt($('mapW').value, 10) || 30, 8, 120),
    h: clamp(parseInt($('mapH').value, 10) || 22, 8, 120),
    ppg: parseInt($('ppg').value, 10),
    density: num('density'),
    complexity: num('complexity'),
    water: num('water'),
    lava: num('lava'),
    props: num('propsAmt'),
    name: $('mapName').value
  };
}

function generate() {
  busy(true);
  setTimeout(() => {
    try {
      state.bg.img = null;
      const cfg = cfgFromUI();
      state.map = generateMap(cfg);
      state.selected = null; state.selRoomId = null;
      syncTransformUI(); syncRoomSelUI();
      state.map.name = cfg.name && cfg.name !== 'Untitled Map' ? cfg.name : GENERATORS[cfg.type].label;
      $('mapName').value = state.map.name;
      state.undo.length = 0; state.redo.length = 0;
      updateUndoButtons();
      refresh(true);
      fitView();
    } catch (err) {
      console.error(err);
      toast('Generation failed: ' + err.message, 5000);
    }
    busy(false);
  }, 20);
}

/* ---------------- background image tracing ---------------- */

function applyBgGrid() {
  const b = state.bg;
  if (!b.img) return;
  const w = clamp(Math.floor((b.img.width - b.offX) / b.ppg), 1, 200);
  const h = clamp(Math.floor((b.img.height - b.offY) / b.ppg), 1, 200);
  const old = state.map;
  const m = new GameMap(w, h, b.ppg);
  m.fill(T.STONE);
  m.name = old ? old.name : 'Traced Map';
  m.seed = 'traced';
  if (old && state.bg.keepCells) {
    for (let y = 0; y < Math.min(h, old.h); y++)
      for (let x = 0; x < Math.min(w, old.w); x++) m.set(x, y, old.get(x, y));
    m.props = old.props; m.doors = old.doors; m.lights = old.lights;
  }
  state.bg.keepCells = true;
  state.map = m;
  $('mapW').value = w; $('mapH').value = h;
  $('exportPpg').value = [35, 50, 70, 100, 140].reduce((a, v) =>
    Math.abs(v - b.ppg) < Math.abs(a - b.ppg) ? v : a, 70);
  refresh(true);
}

/* ---------------- export ---------------- */

function renderForExport(withGrid) {
  const map = state.map;
  const ppg = parseInt($('exportPpg').value, 10);
  const maxDim = Math.max(map.w, map.h) * ppg;
  if (maxDim > 8192) {
    toast('That resolution exceeds 8192 px — pick a smaller grid size.', 4500);
    return null;
  }
  const opts = renderOptsFromUI({ grid: withGrid, ppg });
  const cv = makeCanvas(map.w * ppg, map.h * ppg);
  const ctx = cv.getContext('2d');
  // a cold walk: no cached terrain, and no red tracing overlay, which is an
  // editing aid and has no business in the picture anybody else sees
  drawLayerStack(ctx, map, ppg, opts, hashString(String(map.seed)) & 0xffff, {
    rooms: state.rooms,
    bgImage: state.bg.img || null,
    drawBg: state.bg.img ? drawBackgroundImage : null
  });
  return cv;
}

const IMAGE_FORMATS = {
  png: { mime: 'image/png', ext: 'png', quality: undefined },
  jpg: { mime: 'image/jpeg', ext: 'jpg', quality: 0.9 },
  webp: { mime: 'image/webp', ext: 'webp', quality: 0.92 }
};

async function exportPNG() {
  busy(true);
  await new Promise(r => setTimeout(r, 20));
  const cv = renderForExport($('expGrid').checked);
  if (cv) {
    const f = IMAGE_FORMATS[$('expFormat').value] || IMAGE_FORMATS.png;
    const blob = await canvasToBlob(cv, f.mime, f.quality);
    downloadBlob(blob, safeName(state.map.name) + '.' + f.ext);
    const mb = blob.size / 1048576;
    toast(`Image exported — ${cv.width} × ${cv.height} px, ${mb < 1 ? Math.round(blob.size / 1024) + ' KB' : mb.toFixed(1) + ' MB'}`
      + (mb > 5 ? ' · over Roll20’s 5 MB limit — try JPEG or a smaller grid size' : ''), mb > 5 ? 6000 : 3000);
  }
  busy(false);
}

async function exportUVTT() {
  busy(true);
  await new Promise(r => setTimeout(r, 20));
  const map = state.map;
  const ppg = parseInt($('exportPpg').value, 10);
  const cv = renderForExport($('expGrid').checked);
  if (cv) {
    const prevPpg = map.ppg;
    map.ppg = ppg;
    const data = toUVTT(map, canvasToBase64(cv, 'image/png'), {
      bakedLighting: $('optLighting').checked,
      border: $('expBorder').checked,
      propWalls: $('expPropWalls').checked
    });
    map.ppg = prevPpg;
    downloadText(JSON.stringify(data), safeName(map.name) + '.dd2vtt');
    toast(`Universal VTT exported — ${data.line_of_sight.length} wall runs, ${data.portals.length} doors, ${data.lights.length} lights`, 4000);
  }
  busy(false);
}

async function exportFoundry() {
  busy(true);
  await new Promise(r => setTimeout(r, 20));
  const map = state.map;
  const ppg = parseInt($('exportPpg').value, 10);
  const prevPpg = map.ppg;
  map.ppg = ppg;
  const f = IMAGE_FORMATS[$('expFormat').value] || IMAGE_FORMATS.png;
  const scene = toFoundryScene(map, {
    imageName: safeName(map.name) + '.' + f.ext,
    border: $('expBorder').checked,
    propWalls: $('expPropWalls').checked
  });
  map.ppg = prevPpg;
  downloadText(JSON.stringify(scene, null, 1), safeName(map.name) + '.scene.json');
  toast(`Foundry scene exported — ${scene.walls.length} walls. Export the PNG too, and put it where the scene expects it.`, 5000);
  busy(false);
}

function exportProject() {
  const data = {
    kind: 'battlemap-forge-project', version: 1,
    map: state.map.serialize(),
    ui: cfgFromUI(),
    customProps: Object.values(CUSTOM_PROPS),
    customRooms: Object.values(CUSTOM_ROOMS),
    adhocRooms: usedAdhocRooms(state.map),
    appearance: {
      grid: $('optGrid').checked, gridColor: $('gridColor').value, gridAlpha: num('gridAlpha'),
      lighting: $('optLighting').checked, ambient: num('ambient'),
      ambientColor: $('ambientColor').value, vignette: $('optVignette').checked,
      roomLighting: $('optRoomLight').checked,
      shadows: $('optShadows').checked,
      gridType: $('gridType').value, gridWeight: num('gridWeight'),
      gridOffX: num('gridOffX'), gridOffY: num('gridOffY'),
      gridRelief: $('gridRelief').checked,
      atmos: atmosFromUI()
    }
  };
  downloadText(JSON.stringify(data), safeName(state.map.name) + '.forge.json');
  toast('Project saved. Note: a traced background image is not stored in the project file.', 4500);
}

function loadProject(text) {
  try {
    const data = JSON.parse(text);
    if (data.kind !== 'battlemap-forge-project') throw new Error('not a Battlemap Forge project');
    if (data.customProps) adoptCustomProps(data.customProps);
    if (data.customRooms) { adoptCustomRooms(data.customRooms); buildRoomPanel(); }
    if (data.adhocRooms) adoptAdhocRooms(data.adhocRooms);
    state.map = GameMap.deserialize(data.map);
    state.bg.img = null;
    state.selected = null; state.selRoomId = null; syncRoomSelUI();
    if (data.ui) {
      $('mapType').value = data.ui.type || 'dungeon';
      $('seed').value = data.ui.seed || 'forge';
      $('mapW').value = data.map.w; $('mapH').value = data.map.h;
      $('ppg').value = String(data.map.ppg);
      for (const [id, key] of [['density', 'density'], ['complexity', 'complexity'], ['water', 'water'], ['lava', 'lava'], ['propsAmt', 'props']])
        if (data.ui[key] !== undefined) $(id).value = data.ui[key];
    }
    if (data.appearance) {
      const a = data.appearance;
      $('optGrid').checked = a.grid; $('gridColor').value = a.gridColor;
      $('gridAlpha').value = a.gridAlpha; $('optLighting').checked = a.lighting;
      $('ambient').value = a.ambient; $('ambientColor').value = a.ambientColor;
      $('optVignette').checked = a.vignette; $('optShadows').checked = a.shadows;
      if (a.roomLighting !== undefined) $('optRoomLight').checked = a.roomLighting;
      // grid shape and weather arrived later than the first project format, so
      // a file without them keeps the defaults rather than blanking the panel
      if (a.gridType) $('gridType').value = a.gridType;
      if (a.gridWeight !== undefined) $('gridWeight').value = a.gridWeight;
      if (a.gridOffX !== undefined) $('gridOffX').value = a.gridOffX;
      if (a.gridOffY !== undefined) $('gridOffY').value = a.gridOffY;
      if (a.gridRelief !== undefined) $('gridRelief').checked = a.gridRelief;
      if (a.atmos) {
        $('atmosPreset').value = ATMOS[a.atmos.preset] ? a.atmos.preset : 'none';
        for (const [id, key] of [['atmosAmount', 'amount'], ['atmosSat', 'sat'],
          ['atmosContrast', 'contrast'], ['atmosWarm', 'warm'], ['atmosFade', 'fade']])
          if (a.atmos[key] !== undefined) $(id).value = a.atmos[key];
      }
      syncGridUI();
      syncAtmosUI();
    }
    state.selLabel = null;
    syncLabelUI();
    $('mapName').value = state.map.name;
    applyKnobSchema();
    syncSliderLabels();
    state.undo.length = 0; state.redo.length = 0; updateUndoButtons();
    refresh(true); fitView();
    toast('Project loaded.');
  } catch (err) {
    toast('Could not open that file: ' + err.message, 4500);
  }
}

/* ---------------- slider labels ---------------- */

const SLIDER_LABELS = [
  ['density', 'densityLbl'], ['complexity', 'complexityLbl'], ['water', 'waterLbl'],
  ['lava', 'lavaLbl'], ['propsAmt', 'propsLbl'], ['gridAlpha', 'gridAlphaLbl'],
  ['ambient', 'ambientLbl'], ['bgPpg', 'bgPpgLbl'], ['bgOffX', 'bgOffXLbl'], ['bgOffY', 'bgOffYLbl']
];

function syncSliderLabels() {
  for (const [id, lbl] of SLIDER_LABELS) if ($(id) && $(lbl)) $(lbl).textContent = $(id).value;
  $('ppgLbl').textContent = $('ppg').value;
  $('brushLbl').textContent = state.brush;
  /* Values set from state rather than dragged fire no event, so the filled
     part of each track has to be repainted here too. */
  if (typeof initRangeFill === 'function') initRangeFill();
}

/* ---------------- wiring ---------------- */

function wire() {
  buildTypeSelect();
  buildSwatches();
  buildPropPanel();
  buildRoomPanel();
  buildFloatBar();
  buildAtmosSelect();
  buildLabelPanel();
  state.labelStyle = defaultLabel();
  syncLabelUI();
  syncAtmosUI();
  syncGridUI();
  peWire();
  loadCustomProps();
  loadCustomRooms();
  setupPanels();

  for (const [id] of SLIDER_LABELS) {
    const el = $(id);
    if (el) el.addEventListener('input', syncSliderLabels);
  }
  $('ppg').addEventListener('change', () => { $('ppgLbl').textContent = $('ppg').value; });

  $('generate').addEventListener('click', generate);
  $('quickGen').addEventListener('click', generate);
  $('rerollSeed').addEventListener('click', () => {
    const words = ['ash', 'gloom', 'thorn', 'mire', 'vault', 'ember', 'wyrm', 'hollow', 'grim', 'salt',
      'frost', 'iron', 'bone', 'moss', 'dusk', 'raven', 'stone', 'tide', 'briar', 'kiln'];
    const r = new RNG(Date.now() ^ (Math.random() * 1e9));
    $('seed').value = r.pick(words) + r.pick(words) + r.int(10, 99);
    generate();
  });

  $('mapType').addEventListener('change', () => { applyKnobSchema(); generate(); });
  $('mapName').addEventListener('input', () => { if (state.map) state.map.name = $('mapName').value; });

  for (const id of ['optGrid', 'gridColor', 'gridAlpha', 'optLighting', 'ambient',
    'ambientColor', 'optVignette', 'optRoomLight', 'optStyle'])
    $(id).addEventListener('input', () => refresh(false));

  // ---- grid shape ----
  for (const id of ['gridType', 'gridWeight', 'gridOffX', 'gridOffY', 'gridRelief'])
    $(id).addEventListener('input', () => { syncGridUI(); refresh(false); });

  // ---- weather ----
  for (const id of ['atmosPreset', 'atmosAmount', 'atmosSat', 'atmosContrast', 'atmosWarm', 'atmosFade'])
    $(id).addEventListener('input', () => { syncAtmosUI(); refresh(false); });

  // ---- labels ----
  // one undo entry per gesture, taken before the first change of a drag
  for (const [id] of LABEL_FIELDS)
    $(id).addEventListener('pointerdown', () => { if (selectedLabel()) snapshot(); });
  $('lblRot').addEventListener('pointerdown', () => { if (selectedLabel()) snapshot(); });
  for (const [id] of LABEL_FIELDS) $(id).addEventListener('input', applyLabelFromUI);
  $('lblRot').addEventListener('input', applyLabelFromUI);
  // typing is its own gesture: one snapshot when the box is first focused
  $('lblText').addEventListener('focus', () => { if (selectedLabel()) snapshot(); });
  $('lblDupe').addEventListener('click', duplicateLabel);
  $('lblDelete').addEventListener('click', deleteLabel);
  $('lblClear').addEventListener('click', () => {
    if (!state.map || !state.map.labels.length) { toast('There are no labels to remove.', 2600); return; }
    snapshot();
    const n = state.map.labels.length;
    state.map.labels = [];
    state.selLabel = null;
    syncLabelUI();
    refresh(false);
    toast('Removed ' + n + ' label' + (n === 1 ? '' : 's') + ' — ⌘Z puts them back.');
  });

  // ---- how props land ----
  $('propPlaceMode').addEventListener('change', () => {
    state.placeMode = $('propPlaceMode').value;
    $('propScatterBox').style.display = state.placeMode === 'one' ? 'none' : '';
    $('propPlaceHint').textContent = state.placeMode === 'scatter'
      ? 'Drag to sow the disc. Props never land on top of each other, so density above what the area holds simply fills it.'
      : 'Drag to lay an even trail. Spacing follows the prop’s own footprint and scale.';
    paint();
  });
  for (const id of ['propArea', 'propDensity']) {
    $(id).addEventListener('input', () => {
      state.propArea = num('propArea');
      state.propDensity = num('propDensity');
      $('propAreaLbl').textContent = state.propArea.toFixed(2).replace(/0$/, '');
      $('propDensityLbl').textContent = state.propDensity.toFixed(2);
      paint();
    });
  }

  $('autoWall').addEventListener('click', () => {
    snapshot();
    const r = autoWallFloorPlan(state.map);
    const n = r.added;
    refresh(false);
    toast(n
      ? 'Walled the floor plan — ' + n + ' partitions added' +
        (r.skipped ? ', ' + r.skipped + ' skipped where solid stone already walls it.' : '.')
      : (r.skipped
        ? 'Nothing to add — solid stone already walls that floor plan.'
        : 'Every floor boundary is already walled.'), 4500);
  });
  $('clearEdges').addEventListener('click', () => {
    snapshot();
    state.map.hw.fill(EDGE.NONE);
    state.map.vw.fill(EDGE.NONE);
    refresh(false);
    toast('All partitions removed.');
  });
  $('optShadows').addEventListener('input', () => refresh(true));

  for (const b of document.querySelectorAll('#toolGrid button'))
    b.addEventListener('click', () => setTool(b.dataset.tool));

  for (const [id, fn] of [['propSearch', buildPropPanel], ['roomSearch', buildRoomPanel]]) {
    $(id).addEventListener('input', fn);
    $(id).addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.target.value = ''; fn(); ev.target.blur(); }
      ev.stopPropagation();          // let people type 'v', 'e' etc. in the box
    });
  }

  for (const id of ['propLightColor', 'propLightRange', 'propLightInt']) {
    $(id).addEventListener('pointerdown', () => { if (selectedProp()) snapshot(); });
    $(id).addEventListener('input', applyLightToSelection);
  }
  for (const b of document.querySelectorAll('[data-lightpreset]'))
    b.addEventListener('click', () => {
      if (!selectedProp()) { toast('Select a light-giving prop first.', 3000); return; }
      snapshot();
      $('propLightColor').value = b.dataset.lightpreset;
      applyLightToSelection();
    });
  $('propLightReset').addEventListener('click', () => {
    const p = selectedProp(); if (!p) return;
    snapshot();
    delete p.lightColor; delete p.lightRange; delete p.lightIntensity;
    syncLightsFromProps(state.map); syncLightUI(); refresh(false);
  });

  $('waterAnimate').addEventListener('input', () => {
    if ($('waterAnimate').checked) startWaterAnimation(); else { stopWaterAnimation(); paint(); }
  });
  for (const id of ['waterFlow', 'waterSpeed']) {
    $(id).addEventListener('input', () => {
      $('waterFlowLbl').textContent = Math.round(num('waterFlow') * 360) + '\u00b0';
      $('waterSpeedLbl').textContent = num('waterSpeed').toFixed(1);
      paint();
    });
  }
  $('waterFlow').addEventListener('change', () => refresh(true));

  $('brushSize').addEventListener('input', () => setBrush(num('brushSize')));
  $('brushRound').addEventListener('input', () => { state.round = $('brushRound').checked; paint(); });

  // ---- prop transform ----
  // one undo entry per slider gesture, taken before the first change
  for (const id of ['propRot', 'propScale', 'propWidth', 'propHeight']) {
    $(id).addEventListener('pointerdown', () => { if (selectedProp()) snapshot(); });
  }
  $('propRot').addEventListener('input', () => {
    state.propRot = snapAngle(num('propRot') * Math.PI / 180);
    syncTransformUI(); applyTransformToSelection();
  });
  $('propScale').addEventListener('input', () => {
    state.propScale = clamp(num('propScale'), 0.25, 4);
    syncTransformUI(); applyTransformToSelection();
  });
  $('propWidth').addEventListener('input', () => {
    state.propWidth = clamp(num('propWidth'), 0.25, 4);
    syncTransformUI(); applyTransformToSelection();
  });
  $('propHeight').addEventListener('input', () => {
    state.propHeight = clamp(num('propHeight'), 0.25, 4);
    syncTransformUI(); applyTransformToSelection();
  });
  $('propSunk').addEventListener('change', () => {
    const p = selectedProp();
    if (p) { snapshot(); p.sunk = $('propSunk').checked; refresh(false); }
    else state.propSunk = $('propSunk').checked;
    syncTransformUI();
  });
  $('propSnap').addEventListener('change', () => {
    state.snapDeg = parseInt($('propSnap').value, 10) || 0;
    state.propRot = snapAngle(state.propRot);
    if (selectedProp()) { snapshot(); applyTransformToSelection(); }
    syncTransformUI();
  });
  const nudge = (dir) => {
    const step = (state.snapDeg || 15) * Math.PI / 180;
    if (selectedProp()) snapshot();
    state.propRot = snapAngle(state.propRot + dir * step);
    syncTransformUI(); applyTransformToSelection();
  };
  $('captureRoomBtn').addEventListener('click', () => {
    setTool('capture');
    toast('Drag a rectangle on the map to capture it as a room.', 4000);
  });
  $('roomsExport').addEventListener('click', () => {
    const list = Object.values(CUSTOM_ROOMS);
    if (!list.length) { toast('No custom rooms to export yet.', 3000); return; }
    downloadText(JSON.stringify({ kind: 'battlemap-forge-rooms', version: 1, rooms: list }, null, 1),
      'custom-rooms.forgerooms.json');
  });
  $('roomsImport').addEventListener('click', () => $('roomPackFile').click());
  $('roomPackFile').addEventListener('change', (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const data = JSON.parse(fr.result);
        const list = data.rooms || (Array.isArray(data) ? data : null);
        if (!list) throw new Error('not a room pack');
        const n = adoptCustomRooms(list);
        buildRoomPanel();
        toast('Imported ' + n + ' room' + (n === 1 ? '' : 's') + '.');
      } catch (e) { toast('Could not read that pack: ' + e.message, 4500); }
    };
    fr.readAsText(f);
    ev.target.value = '';
  });

  $('roomRotate').addEventListener('click', () => rotateRoom(1));
  $('roomFlip').addEventListener('click', flipRoom);
  $('selTurn').addEventListener('click', () => { const p = selectedRoom(); if (p) mutateRoom({ rot: (p.rot + 1) % 4 }); });
  $('selFlip').addEventListener('click', () => { const p = selectedRoom(); if (p) mutateRoom({ flip: !p.flip }); });
  $('selDupe').addEventListener('click', duplicateRoom);
  $('selDelete').addEventListener('click', deleteRoom);

  $('rotLeft').addEventListener('click', () => nudge(-1));
  $('rotRight').addEventListener('click', () => nudge(1));
  $('tformReset').addEventListener('click', () => {
    if (selectedProp()) snapshot();
    state.propRot = 0; state.propScale = 1; state.propWidth = 1; state.propHeight = 1;
    syncTransformUI(); applyTransformToSelection();
  });

  $('undoBtn').addEventListener('click', undo);
  $('redoBtn').addEventListener('click', redo);
  $('zoomIn').addEventListener('click', () => zoomAt(view.clientWidth / 2, view.clientHeight / 2, 1.25));
  $('zoomOut').addEventListener('click', () => zoomAt(view.clientWidth / 2, view.clientHeight / 2, 0.8));
  $('fitBtn').addEventListener('click', fitView);

  $('expPng').addEventListener('click', exportPNG);
  $('expUvtt').addEventListener('click', exportUVTT);
  $('expFoundry').addEventListener('click', exportFoundry);
  $('expProject').addEventListener('click', exportProject);
  $('impProject').addEventListener('click', () => $('projectFile').click());
  $('projectFile').addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => loadProject(fr.result);
    fr.readAsText(f);
    ev.target.value = '';
  });
  for (const id of ['exportPpg', 'expBorder', 'expPropWalls'])
    $(id).addEventListener('change', updateStats);

  $('openPropEditor').addEventListener('click', () => peOpen(null));

  $('clearProps').addEventListener('click', () => {
    snapshot(); state.map.props = []; state.selected = null;
    syncLightsFromProps(state.map); syncTransformUI(); refresh(false);
  });
  $('relight').addEventListener('click', () => {
    snapshot(); syncLightsFromProps(state.map); refresh(false); toast('Lights rebuilt from props.');
  });

  // background tracing
  $('bgLoad').addEventListener('click', () => $('bgFile').click());
  $('bgFile').addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const img = new Image();
    // Read as a data URL rather than a blob URL: blob URLs taint the canvas when
    // the page itself is opened from file://, which would break PNG export.
    const reader = new FileReader();
    img.onload = () => {
      state.bg.img = img;
      state.bg.keepCells = false;
      $('bgOffX').max = String(Math.min(600, img.width)); $('bgOffX').min = '0';
      $('bgOffY').max = String(Math.min(600, img.height)); $('bgOffY').min = '0';
      $('bgOffX').value = '0'; $('bgOffY').value = '0';
      state.bg.offX = 0; state.bg.offY = 0;
      // Imported art is already lit; don't darken it on top.
      $('optLighting').checked = false;
      syncSliderLabels();
      applyBgGrid();
      fitView();
      toast('Image loaded. Dial in the grid size, then trace walls with the Wall tool.', 5000);
      document.querySelector('section[data-group="trace"]').classList.remove('collapsed');
    };
    img.onerror = () => toast('Could not read that image.', 4000);
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = () => toast('Could not read that image.', 4000);
    reader.readAsDataURL(f);
    ev.target.value = '';
  });
  for (const id of ['bgPpg', 'bgOffX', 'bgOffY']) {
    $(id).addEventListener('input', () => {
      state.bg.ppg = parseInt($('bgPpg').value, 10);
      state.bg.offX = parseInt($('bgOffX').value, 10);
      state.bg.offY = parseInt($('bgOffY').value, 10);
      if (state.bg.img) applyBgGrid();
    });
  }
  // these two boxes and the eyes in the Layers panel show the same fact, so
  // each writes the other rather than letting them drift apart
  for (const kind in LAYER_MIRROR) {
    $(LAYER_MIRROR[kind]).addEventListener('change', () => {
      const L = state.map && layerOfKind(state.map, kind);
      if (!L) return;
      L.visible = $(LAYER_MIRROR[kind]).checked;
      syncLightsFromProps(state.map);
      buildLayerPanel();
    });
  }

  $('traceSens').addEventListener('input', () => { $('traceSensLbl').textContent = $('traceSens').value; });

  $('autoTraceBtn').addEventListener('click', () => {
    if (!state.bg.img) { toast('Load a map image first.', 3000); return; }
    busy(true);
    setTimeout(() => {
      snapshot();
      const r = autoTrace(state.map, state.bg, {
        sensitivity: num('traceSens'),
        walls: $('traceWalls').checked,
        outside: $('traceOutside').checked,
        border: $('traceBorder').checked
      });
      if (!r.ok) {
        toast(r.reason, 5000);
        $('traceReport').textContent = r.reason;
      } else {
        $('traceReport').innerHTML =
          'Found <b>' + r.walls + '</b> wall segments' +
          (r.outside ? ' and marked <b>' + r.outside + '</b> squares as outside' : '') +
          '. Check the red overlay, then fix up with Partition.';
        toast('Traced ' + r.walls + ' wall segments — check the red overlay.', 4000);
      }
      refresh(true);
      busy(false);
    }, 20);
  });

  $('traceClear').addEventListener('click', () => {
    if (!state.map) return;
    snapshot();
    for (let i = 0; i < state.map.hw.length; i++) if (state.map.hw[i] === EDGE.WALL) state.map.hw[i] = EDGE.NONE;
    for (let i = 0; i < state.map.vw.length; i++) if (state.map.vw[i] === EDGE.WALL) state.map.vw[i] = EDGE.NONE;
    $('traceReport').textContent = '';
    refresh(true);
    toast('Traced walls cleared (doorways kept).');
  });

  $('bgClear').addEventListener('click', () => {
    state.bg.img = null; state.bg.keepCells = false;
    refresh(true);
    toast('Background image removed.');
  });

  setupLayerPanel();
  setupObjectsPanel();
  applyKnobSchema();
  syncSliderLabels();
  setBrush(1);
  state.snapDeg = parseInt($('propSnap').value, 10) || 0;
  syncTransformUI();
  updateUndoButtons();
}

wire();
generate();
buildLayerPanel();
buildObjectsPanel();
