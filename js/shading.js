/* Battlemap Forge — prop shading.
 *
 * Props are drawn in code, which keeps them crisp at any export resolution but
 * used to leave them looking flat: a barrel and a rug were both a coloured
 * outline wearing the same small drop shadow. What sells a top-down object as
 * an object isn't detail, it's three cues, and all three key off one number —
 * how tall the thing is:
 *
 *   cast shadow   thrown away from the light, longer and softer the taller the
 *                 object stands
 *   side face     the sliver of the object's own side you catch on the shadow
 *                 side, which is what gives it thickness
 *   contact AO    a tight darkening right where it meets the floor, which is
 *                 what stops it reading as a sticker laid on the map
 *
 * So every prop declares a height in grid units and this file turns that single
 * number into all three. One unit is one 5 ft square, so a dining table is
 * about 0.5 and a stone pillar about 2.4.
 *
 * The other half of the job is *where* those cues get drawn. The renderer used
 * to set ctx.shadowColor and then call the prop's own draw function, so every
 * fill and stroke inside it cast a separate shadow — a bookshelf threw one
 * shadow per book, and the stack of them read as mud. Here each prop is
 * rasterised once into an offscreen canvas and the shadow is taken from that
 * silhouette, so a prop casts exactly one shadow however many shapes it is made
 * of. Those canvases are cached, which makes this cheaper than what it replaces
 * rather than more expensive.
 *
 * The prop itself is still drawn as vectors on top, so nothing here costs you
 * any sharpness at export resolution. The rasterised copy only ever supplies
 * shadow, side face and contact shading.
 */
'use strict';

/* ---------------- the light ---------------- */

/**
 * The one light for the whole prop library. Every shadow, side face and
 * highlight is thrown along this vector, and that consistency is most of what
 * makes props drawn months apart still read as one set.
 *
 * It points the way shadows *fall*, so the sun itself sits up and to the left
 * of the map. The direction is inherited from the old hand-tuned drop shadow
 * (offset +0.05, +0.07) so existing maps don't suddenly relight themselves.
 */
const SUN = { x: 0.582, y: 0.813 };

/** Shadow length as a fraction of height. A steep sun — about 78° up — which
 *  is what keeps a 3-unit tree from throwing a shadow across half the room. */
const SHADOW_LENGTH = 0.22;

/** Shadow softness in grid units: a floor for short objects, plus a term that
 *  grows with height, because a distant occluder casts a vaguer edge. */
const SHADOW_BLUR_BASE = 0.05;
const SHADOW_BLUR_PER_UNIT = 0.085;

/** How far the side face peeks out from under the top face, per unit of height.
 *  Much shorter than the shadow — this is the object's own thickness, not the
 *  ground it darkens. */
const SIDE_LENGTH = 0.055;

/** Contact shading: tight, dark, and barely offset. */
const AO_BLUR = 0.06;
const AO_ALPHA = 0.34;

/* ---------------- height ---------------- */

/**
 * Fallback heights per category, in grid units, for props that don't name one.
 * These are deliberately mid-range: a prop that looks wrong with the default is
 * a prop that should be declaring `h` for itself.
 */
const PROP_HEIGHT_BY_CAT = {
  furniture: 0.5,
  dressing: 0.45,
  structure: 0.9,
  nature: 0.8,
  light: 0.4,
  grand: 1.6,
  arcane: 0.5,
  vehicle: 0.7,
  marker: 0
};

/** How tall a prop stands, in grid units. Zero means it lies flat on the floor
 *  and gets no shadow, no side and no contact shading at all. */
function propHeight(def) {
  if (!def) return 0;
  if (def.under) return 0;                 // rugs, mosaics, circles: painted on the floor
  if (def.h !== undefined) return def.h;
  const byCat = PROP_HEIGHT_BY_CAT[def.cat];
  return byCat === undefined ? 0.5 : byCat;
}

/**
 * The cast shadow for a given height, in grid units.
 *
 * A hanging prop — chandelier, wisp — is a special case: it is not standing on
 * the floor, so its shadow lands far from it and arrives very soft and faint,
 * and it has no side face or contact shading to speak of.
 */
function propShadow(def) {
  const h = propHeight(def);
  if (h <= 0) return null;
  const hang = !!def.floats;
  const len = h * SHADOW_LENGTH * (hang ? 2.2 : 1);
  const blur = SHADOW_BLUR_BASE + SHADOW_BLUR_PER_UNIT * h * (hang ? 2.4 : 1);
  // taller means further from the ground means a more diffuse, weaker shadow
  const alpha = clamp(0.5 - 0.055 * h, 0.26, 0.5) * (hang ? 0.55 : 1);
  return { dx: SUN.x * len, dy: SUN.y * len, blur, alpha };
}

/** Whether a prop should get a side face and contact shading — floor-standing
 *  things with some height to them. */
function propHasBody(def) {
  return propHeight(def) > 0.05 && !def.floats;
}

/* ---------------- offscreen silhouettes ---------------- */

/** Footprint padding when rasterising: props routinely draw outside `size`
 *  (a tree's canopy, a web's corners), and the shadow needs room to blur. */
const SPRITE_PAD = 1.7;

/** Cap on a rasterised sprite's side in pixels, so a 12-square skyship at print
 *  resolution doesn't try to allocate a canvas the size of the map. */
const SPRITE_MAX_PX = 1600;

/**
 * Shading rasters are built at a fraction of the map's own resolution. Every
 * one of them is either blurred or hidden behind the prop, so the detail would
 * be thrown away anyway — and at half resolution they cost a quarter of the
 * pixels to build and to blit, which is the difference between this being free
 * and being the most expensive thing in the renderer on a crowded map.
 *
 * The prop's visible top face is unaffected: that is still drawn as vectors at
 * full resolution.
 */
const SHADE_RES_SCALE = 0.5;

/**
 * Set while a prop is being rasterised for its silhouette. Prop draw functions
 * that paint a soft glow check this and skip it: a torch's glow is light, not
 * substance, and letting it into the silhouette would have every lamp on the
 * map casting a shadow the shape of its own halo.
 */
let SILHOUETTE_PASS = false;

const _spriteCache = new Map();

/** Room for a very crowded map several times over. Cheap to hold: these are
 *  small half-resolution canvases, not full-size ones. */
const SPRITE_CACHE_LIMIT = 2000;

/** The span a prop's sprite needs to cover, in grid units. */
function spriteSpan(def) {
  const sh = propShadow(def);
  const blur = sh ? sh.blur : 0;
  return Math.max(def.size * SPRITE_PAD, def.size + 8 * blur);
}

/** Rasterisation resolution for a prop's shading, in pixels per grid unit,
 *  bucketed to whole pixels so neighbouring zoom levels share cache entries. */
function spriteRes(def, u) {
  const span = spriteSpan(def);
  const full = Math.min(u * SHADE_RES_SCALE, SPRITE_MAX_PX / span);
  return Math.max(6, Math.round(full));
}

/** A blurred copy of a canvas. Uses the filter path where it exists — every
 *  current browser — and falls back to a few offset blits, which is coarse but
 *  only ever affects the softness of a shadow. */
function blurredCopy(src, radiusPx) {
  const out = makeCanvas(src.width, src.height);
  const c = out.getContext('2d');
  if (radiusPx < 0.4) { c.drawImage(src, 0, 0); return out; }
  if (typeof c.filter === 'string') {
    c.filter = `blur(${radiusPx}px)`;
    c.drawImage(src, 0, 0);
    c.filter = 'none';
    return out;
  }
  const r = radiusPx * 0.7;
  c.globalAlpha = 0.3;
  for (const [dx, dy] of [[0, 0], [-r, 0], [r, 0], [0, -r], [0, r]]) c.drawImage(src, dx, dy);
  c.globalAlpha = 1;
  return out;
}

/** A flat black copy of a canvas — the silhouette, with the artwork discarded. */
function silhouetteOf(src) {
  const out = makeCanvas(src.width, src.height);
  const c = out.getContext('2d');
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = '#000';
  c.fillRect(0, 0, src.width, src.height);
  return out;
}

/** A darkened copy of the artwork — the object's own side, which sees less of
 *  the sun than its top does but is still made of the same stuff. */
function darkenedCopy(src, amount) {
  const out = makeCanvas(src.width, src.height);
  const c = out.getContext('2d');
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = `rgba(0,0,0,${amount})`;
  c.fillRect(0, 0, src.width, src.height);
  return out;
}

/**
 * The cached raster set for one prop: its cast shadow, its contact shading and
 * its side face, all at `res` pixels per grid unit and all centred in a square
 * canvas of `spriteSpan(def)` units.
 *
 * `seed` is in the key because many props use their seeded rng for detail —
 * which books are on the shelf, how the rubble fell — so two rubble piles are
 * genuinely different silhouettes.
 */
function propSprite(def, res, seed) {
  const key = `${def.key}|${res}|${seed}`;
  const hit = _spriteCache.get(key);
  if (hit) return hit;

  // Evict oldest-first rather than clearing outright. A map with more props
  // than the cache holds would otherwise throw the whole cache away on every
  // frame and rebuild it from nothing, which is far worse than not caching.
  while (_spriteCache.size >= SPRITE_CACHE_LIMIT) {
    _spriteCache.delete(_spriteCache.keys().next().value);
  }

  const span = spriteSpan(def);
  const side = Math.max(2, Math.ceil(span * res));
  const art = makeCanvas(side, side);
  const c = art.getContext('2d');
  c.translate(side / 2, side / 2);
  SILHOUETTE_PASS = true;
  try {
    def.draw(c, res, seededFn(seed));
  } finally {
    SILHOUETTE_PASS = false;
  }

  const mask = silhouetteOf(art);
  const sh = propShadow(def);
  const entry = {
    span,
    res,
    shadow: sh ? blurredCopy(mask, sh.blur * res) : null,
    ao: propHasBody(def) ? blurredCopy(mask, AO_BLUR * res) : null,
    side: propHasBody(def) ? darkenedCopy(art, 0.45) : null
  };
  _spriteCache.set(key, entry);
  return entry;
}

/** Drop every cached sprite. Call when prop definitions themselves change —
 *  saving an edit in the prop designer, importing a prop pack. */
function clearPropSprites() { _spriteCache.clear(); }

/* ---------------- placing them ---------------- */

/**
 * Draw one of a prop's cached rasters into the map, honouring the prop's own
 * rotation, scale, stretch and mirror, and offset by (offX, offY) map pixels.
 *
 * The offset is applied *before* the rotation so it stays in world space: the
 * sun does not turn when the barrel does.
 */
function blitPropRaster(ctx, img, sprite, p, u, offX, offY) {
  const s = u / sprite.res;                     // sprite pixels -> map pixels
  const sc = p.scale || 1;
  const wd = (p.width === undefined ? 1 : p.width) * (p.mirror ? -1 : 1);
  const ht = p.height === undefined ? 1 : p.height;
  ctx.save();
  ctx.translate(p.x * u + offX, p.y * u + offY);
  ctx.rotate(p.rot || 0);
  ctx.scale(sc * wd * s, sc * ht * s);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}
