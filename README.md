# Battlemap Forge

A browser-based battlemap generator for tabletop RPGs. It forges a map procedurally,
lets you paint and dress it by hand — down to the weather, the labels and the shape of the
grid — and exports it in the formats virtual tabletops actually read, including walls,
doors and lights, not just a flat picture.

**To use it: double-click `index.html`.** No install, no build step, no internet
connection, no account. Everything runs locally in your browser, and nothing you make
leaves your machine.

---

## The quick version

1. Pick a **map type**, set the size in squares, hit **Forge Map**.
2. Don't like it? Hit the 🎲 for a new seed, or nudge the sliders and forge again.
3. Touch it up with the paint, prop, door, light and label tools, and set the weather.
4. **Download image** for any VTT, or **Universal VTT** / **Foundry scene** if you want
   walls and lighting to come across too.

Every map is reproducible: the same seed and settings always forge the same map, so you
can note a seed in your campaign notes and get the map back later.

---

## Getting it into your VTT

The exports are built around one rule: **the image and the wall data always use the same
pixels-per-square**, so walls land exactly where the art shows them.

| Your VTT | What to export | Notes |
|---|---|---|
| **Roll20** | Download image | Set the page to the map's size in squares (shown in Map info). Leave "burn grid into the image" off — Roll20 draws its own grid. Free accounts cap uploads at 5 MB; if you go over, switch the format to JPEG. |
| **Foundry VTT** | Download image **and** Foundry scene | Put the image in your world's data folder, then import the `.scene.json`. Walls, doors and lights arrive with it. |
| **Foundry (alternative)** | Universal VTT | Use the *Universal Battlemap Importer* module and drop the `.dd2vtt` in — image and walls in one file. |
| **Fantasy Grounds Unity** | Universal VTT | Import the `.dd2vtt` directly; FGU reads line-of-sight and doors natively. |
| **Owlbear Rodeo, Alchemy, Talespire, Shard** | Download image | Scale to the square count shown in Map info. |
| **Arkenforge, Encounter+, Menyr** | Universal VTT | Same `.dd2vtt` format Dungeondraft and Dungeon Alchemist produce. |
| **Printing** | Download image at 140 px/square | About 1 inch per square at 140 DPI. |

### Grid size

70 px per square is the safe default — it's what Roll20 and Foundry assume. Use 35–50 px
to keep files small for big maps, 100–140 px for print. The export resolution is separate
from the working resolution, so you can preview fast and export large.

---

## Tracing a map you already own

Bought a Czepeku set, or have a map with no wall data? Open **Trace an existing map**,
load the image, and slide *source grid size* until the on-screen grid lines up with the
art. Then take the **Wall** tool and paint over the walls — they show as a red overlay
while you work, and become real line-of-sight on export. Drop **doors** into gaps and
**lights** where the torches are, then export a Universal VTT.

### Automatic tracing

Rather than tracing every wall by hand, press **Trace walls automatically**. It reads the
image and looks for walls on the assumption that holds for most published battlemaps: a
wall is drawn darker than the floor it encloses, and it sits on or near a grid line. It
samples a strip along every grid line and asks whether that strip is meaningfully darker
than the floor to either side.

Get the grid alignment right first — everything keys off it.

- **Sensitivity** trades completeness against noise. Low keeps only the strongest, darkest
  walls; high catches faint ones and a few false positives.
- **Mark dark areas as outside** treats the near-black space around the artwork as
  off-map, so tokens can't wander into the margin.
- **Wall the edge of the artwork** closes the boundary between the map and that margin.

It is tuned to **prefer missing a wall over inventing one**, because adding a wall with
the Partition tool is quicker than hunting down spurious ones. On a test map with known
walls it recovered about three quarters of them with no false positives at default
settings, rising to ~82% at maximum sensitivity with a handful of strays.

It does well on built structures with dark walls and lit floors. It does poorly on caves
and organic maps, where there's often no drawn wall at all — trace those by hand. Doorways
are never guessed: cut them yourself with the **Door** tool, which is fast once the walls
are in.

**Clear traced walls** removes the detected walls but keeps any doorways you've cut.

The red overlay is an editing aid only. It never appears in the exported image — that
stays the original artwork at its original resolution.

---

## Tools

| | |
|---|---|
| **Room** | Drag a rectangle. Floor fills, walls wrap it, and the result stays a movable, turnable object. |
| **Partition** | Paint individual wall segments along the lines between squares. |
| **Prefab** | Stamp a ready-made furnished room from the library. |
| **Paint** | Paint the selected terrain. Brush size 1–12, square or round. |
| **Rect** | Drag a rectangle of the selected terrain — good for rooms. |
| **Prop** | Stamp the selected prop, using the direction, scale, width and height set below the prop grid. |
| **Door** | Drop a door into a gap in a wall. Click an existing door to make it secret. |
| **Light** | Place a light source. Torches, braziers and campfires already carry their own. |
| **Wall** | Paint stone wall — the main tool when tracing an imported image. |
| **Label** (`T`) | Write on the map. Click to drop a label, click an existing one to edit it. |
| **Erase** | Remove props, doors and lights. To erase *terrain*, paint with **Void**. |
| **Select** (`V`) | The default tool. Click a prop or a placed room to select it, then use its handles and floating toolbar. |
| **Pick** | Sample the terrain under the cursor. |

The tools live on an **icon rail** down the right edge, always visible. Everything else —
terrain palette, props, prefabs, generation settings, export — lives behind icon rails on
either side that expand into a panel when you click them.

Click a rail icon to open its panel, click the same icon (or the **✕** in the panel header)
to shut it again. Closing both roughly **doubles the canvas**, and the tools stay where they
are. Picking a tool surfaces the panel that goes with it — choosing Prop opens the prop
picker — unless you've deliberately shut that side, in which case it stays shut. Your panel
layout is remembered between sessions.

Right-click or alt-click deletes whatever is under the cursor. Middle-drag or
space-drag pans; the scroll wheel zooms.

**Shortcuts:** `G` forge · `O` room · `K` partition · `M` prefab · `B` paint · `R` rect ·
`P` prop · `D` door · `L` light · `W` solid · `T` label · `E` erase · `V` or `S` select ·
`H` pan · `I` pick ·
`[` `]` brush size · `⌘Z` / `⇧⌘Z` undo, redo · `F` fit · `0` actual size.

**Rotating:** `Q` and `E` turn whatever you're working with — a selected prop, a placed
room, or the prefab waiting on your cursor. Props turn by the snap setting, rooms by
quarter turns. `X` mirrors.

Both the prop and prefab pickers have a **search box**, and searching spans every category
at once — you don't need to know whether a chandelier lives under *light* or *grand*.

With the Prefab tool active, `R` turns the room and `X` mirrors it before you place it.
With a placed room selected, `R` turns it, `X` mirrors it, `D` duplicates it and `⌫`
deletes it.

---

## Building rooms

There are two kinds of barrier, and they exist for different jobs.

**Solid terrain** fills whole squares. It's the right model for anything carved out of
bedrock — cave walls, dungeon rock — where the stone genuinely occupies the space. The
**Solid** tool paints it, and it's what the dungeon, crypt, cavern and arena generators use.

**Partitions** live on the lines *between* squares. A built wall is about six inches
thick, not five feet, so it shouldn't cost a square of floor. Partitions are what the
tavern and town generators use, and what the Room and Prefab tools build.

The fastest way to lay out a building:

1. **Room** tool — drag a rectangle. Floor fills, walls wrap the outside, and the room
   becomes a **live object**: it is selected the moment you draw it, so you can turn it
   (`Q`/`E`), mirror it (`X`), drag it somewhere else or delete it (`⌫`) from the floating
   toolbar. Deleting puts back whatever it was covering. Drag another rectangle alongside
   and the two rooms share the partition between them.
2. **Door** tool — click a partition to cut a doorway. Click again for a secret door,
   again to close it back up. The cursor highlights the exact segment you'll hit.
3. **Partition** tool — for anything freehand: alcoves, dividing an existing room,
   closing a gap. Right-click or alt-click removes.

If you'd rather paint the floor plan freehand, use the Paint tool with any floor
material, then press **Wall the whole floor plan**. It skips any boundary that already
runs against solid stone — that rock is a wall in its own right, and stacking a partition
on it would double the barrier. It tells you how many it skipped for that reason.

**Wall the whole floor plan** — every boundary between floor and
empty space becomes a wall in one go, leaving your existing doors alone. **Room tool
builds walls** can be unticked if you want to drop in floor without walls.

Doorways are gaps in the wall run, so they export as real openings: line-of-sight stops
at the wall and resumes at the door, and the door itself becomes a portal your VTT can
open and close.

## Prefab rooms

The **Prefab** tool stamps a furnished room — bedroom, kitchen, tavern common room,
library, smithy, shrine, barracks, crypt chamber and others — complete with its own floor
material, walls and furniture.

**Turn** (`R`) rotates the room in 90° steps and **Flip** (`X`) mirrors it; between them
you get all eight orientations. The furniture itself mirrors, not just its position, so
asymmetric pieces read correctly rather than looking reversed. A ghost of the room —
rendered exactly as it will land, in its current orientation — follows the cursor, so you
can see the layout and footprint before you commit.

Rooms interact with what's already on the map:

- **Placed side by side, they share the wall between them.** Because walls live on the
  lines between squares, both rooms write to the same line, so you get one wall band
  rather than two — the two rooms read as one building with an internal partition.
- **Existing doorways survive.** Butting a new room against an old one never bricks up a
  door they already share.
- **Cut doorways into neighbours** (on by default) opens one doorway at the midpoint of
  each wall the new room shares with an existing space. Untick it if you'd rather place
  every door yourself with the Door tool.

### Placed rooms stay editable

A stamped room remains a real object. Take the **Select** tool and click a room's floor —
anywhere that isn't furniture — and it highlights with its name. From there you can:

| | |
|---|---|
| **Turn** (`R`) | Rotate 90°, pivoting around the room's centre so it stays where you put it |
| **Flip** (`X`) | Mirror it, furniture and all |
| **Copy** (`D`) | Drop a duplicate alongside |
| **Delete** (`⌫`) | Remove it |
| Drag | Move it around the map |

Each room remembers the strip of map it covered when it landed. Moving or deleting a room
puts that back exactly as it was — lift a kitchen off a forest floor and you get the
forest floor back, trees, undergrowth and all, not a hole. Rooms that overlap or touch are
repaired automatically, so shuffling one room around never chews up its neighbours.

Furniture that came with a room belongs to it and travels with it. Anything *you* add
inside a room is yours and stays where you put it, even if the room moves out from under
it.

### Making your own prefab rooms

**Capture a region as a room…** in the Prefab panel lets you drag a rectangle on the map and
turn it into a reusable prefab. It takes everything inside: the terrain square by square,
the partitions and doorways, and the furniture with its rotations and scales.

A captured room behaves exactly like a built-in — it turns and mirrors through all eight
orientations, shares walls with its neighbours, and stays a live object you can move or
delete. Because it carries real terrain rather than a single floor colour, a room with a
carpet inlay or mixed flooring comes back exactly as you drew it.

**Export rooms** writes a `.forgerooms.json` to share, and projects carry the custom rooms
they use, so a map you send someone opens complete.

Prefabs are still ordinary map content: any individual piece of furniture can be moved,
turned and resized with the Select tool, and any wall re-cut with the Partition tool.
Clicking furniture selects the furniture; clicking bare floor selects the room.

## Interior lighting

Enclosed rooms each get their own warm pool of light falling off toward their own walls,
which is what makes a building read as lit from within rather than as a floor plan under
one lamp. Outdoor space doesn't get it — a region that reaches the edge of the map counts
as outdoors. Turn it off with **Interior room lighting** under Appearance.

Floorboards also run one way per room, the way a real floor is laid.

---

## Aiming, sizing and stretching props

Under the prop grid are three controls that decide how the next prop lands, with a live
preview over a 3×3 patch of grid so you can judge the size before you place anything. The
gold arrow shows which way the prop is facing.

- **Direction** — the angle, 0–359°, with `↺ 15°` / `↻ 15°` buttons for nudging.
- **Snap direction to** — quantises every angle you set. `90°` keeps furniture square to
  the grid, `45°` allows diagonals, `15°` is fine-grained, and `Free` allows any angle.
- **Scale** — overall size, 0.25× to 4×.
- **Width** — stretches the prop along its own facing axis only, so a table can become a
  long banquet table without also getting fatter. This is the axis the arrow points down.

**Vary angle & size when placing** keeps the scattered, natural look: each prop gets a
random angle (obeying the snap setting) and a slight size jitter. Turn it off when you
want every prop placed at exactly the angle and size you set — lining up pews, market
stalls or a row of barrels. **Mirror at random** flips half of them, which is what stops a
row of anything asymmetric reading as a row of copies.

### Laying down more than one

Under those is **Placing**, which decides what a click and a drag actually do:

| | |
|---|---|
| **One per click** | the default — one prop where you click |
| **Many** | drag to lay an even trail, spaced by the prop's own footprint and scale |
| **Scatter** | drag to sow the disc under the cursor |

Scatter is the fast way to plant a wood, spread rubble through a ruin or fill a market with
crates. **Area** is the radius of the disc, shown as a dashed circle on the cursor.
**Density** sets the spacing rather than a count: at 1 the props pack as close as their own
footprints allow, and thinning it pushes them apart — so the same slider reads the same on a
barrel and on an oak.

Nothing ever lands on top of another of the same kind, which means dragging back over ground
you have already sown adds nothing rather than doubling up, and two oaks never share a
square. It is deliberately blind to everything else: scattering undergrowth doesn't refuse
because there is a barrel nearby, because moss grows round barrels.

The whole drag is one undo step.

### Re-shaping something already placed

**Select** is the tool you start in, so clicking something just selects it. Click a prop
and you get a dashed box with **eight anchor handles** and a rotation handle on a stalk
above it. A toolbar appears floating just above the selection with turn, flip, duplicate
and delete.

Drag the handles:

- **corner handles** — scale the whole prop
- **left / right handles** — stretch its width
- **top / bottom handles** — stretch its height
- **the round handle above** — turn it. It obeys the snap setting; hold `shift` while
  turning for a free angle.

Dragging the prop itself moves it. The sliders in the panel drive the selected prop live,
and `Q` / `E` turn, `+` / `−` resize, `⌫` deletes, `esc` deselects. The older
`shift-drag` to turn and `alt-drag` to resize still work if you prefer them.

Every gesture is a single undo step. Blocking props such as pillars, statues and trees
carry their new shape into the exported walls, so a stretched, rotated pillar blocks
line of sight along its real footprint.

### Rooms stay editable too

Click the floor of a placed prefab (anywhere there isn't a prop) and the **room itself**
is selected, outlined and named, with the same floating toolbar: turn, flip, duplicate,
delete. Drag it to move the whole room, furniture and walls together.

A placed room stays a live object rather than being baked into the map. Each one
remembers the strip of map it covered, so lifting, turning or moving it puts back exactly
what was underneath — pull a room off again and the floor beneath is as it was, with no
scar. Rooms that overlap or touch are repaired automatically when a neighbour moves.

Furniture inside a placed room belongs to that room and travels with it. Anything you
add or duplicate yourself is your own and stays put.

---

## Props

124 props, all drawn in code rather than loaded as images, so they stay crisp at any
export resolution and recolour cleanly. The picker is grouped into tabs:

- **furniture** — tables, beds, shelves, and ornate floor coverings: a fringed **ornate
  rug**, a **round rug** with a medallion, a long **runner**, a tiled **floor mosaic**,
  plus a **banquet table**, **four-poster bed**, **pipe organ**, **harp** and **library
  stack**
- **grand** — statuary and architecture for throne rooms and cathedrals: **angel**,
  **dragon**, **warrior** and **bust** statues, **gargoyles**, an **obelisk**, **fluted
  columns**, a **grand fountain**, a **grand throne**, a stepped **raised dais**, a **high
  altar**, **standing stones**, a **great bell** and hanging **tapestries**
- **arcane** — a glowing **magic circle** and **summoning circle**, a **scrying pool**, a
  **portal arch**, **crystal ball**, **orrery**, **lectern**, **alchemy bench**, **rune
  stone**, **arcane pylon**, **standing mirror** and an open **tome**
- **light** — **chandeliers** (plain and grand, the latter tiered with hanging crystals),
  **candelabra**, **wall sconces**, **hanging lanterns**, a **grand brazier**, a stone
  **fire pit** and a drifting **wisp**
- **vehicle** — a full **skyship** with deck planking, stern castle, helm, cargo hatch,
  masts and wing fins; a smaller **sky skiff**; plus **ballista**, **catapult**, **covered
  wagon**, **gangplank** and **ship's wheel**
- **dressing**, **structure**, **nature**, **marker** — the everyday kit

Anything that glows carries its own light, so dropping a chandelier or a magic circle
lights the room and exports as a real light source to your VTT.

### How props sit on the floor

Every prop declares **how tall it is**, in grid units — one unit being one 5 ft square.
A dining table is 0.5, a bookshelf 1.2, a stone pillar 2.4, an oak tree 3.2. That single
number drives three things, and between them they're what stops a prop reading as a
sticker laid on the map:

- **its cast shadow**, thrown away from the light, growing longer and softer the taller
  the object stands
- **its side face**, the sliver of its own side you catch on the shadow side, which is
  what gives it thickness
- **its contact shading**, the tight darkening right where it meets the ground

Every prop on the map is lit from the same direction — up and to the left — and that
consistency is most of what makes a roomful of furniture look like one scene rather than
a collection of clip art. Props that lie flat, like rugs and magic circles, declare
themselves flat and get none of the three. Props that hang, like chandeliers, throw their
shadow far and faint and touch nothing.

Shadows come from a traced silhouette of the whole prop, so a bookshelf casts one shadow
rather than one per book. Turn the lot off with **Shadows** under Appearance.

### Designing your own props

**Props → Design your own prop…** opens a vector workspace. What you draw becomes a real
prop: placeable with the Prop tool, transformable with the anchor handles, and — if you
tick the boxes — blocking line of sight and casting light in your VTT exports.

**Tools:** Select, Direct Select (edit individual anchor points and bezier handles), Pen,
Rectangle, Ellipse, Polygon, Star, Line, Pan. Shortcuts follow Illustrator's: `V` `A` `P`
`M` `L` `N` `S` `\` `H`, with `⌘Z` undo, `⌘D` duplicate, `⌘A` select all, `[` and `]` to
change stacking order.

The **Pen** works the way you'd expect: click for corner points, click-drag for smooth
curves, click the first point to close, `Enter` or `Esc` to finish an open path. With
**Points**, drag anchors and their handles; handles stay symmetric unless you hold `alt`.
Selecting a rectangle or star with the Points tool converts it to an editable path.

**Appearance:** solid fills, linear and radial gradients, strokes with width and colour,
per-shape opacity, and a swatch palette matched to the map artwork (click for fill,
shift-click for stroke). **Arrange** and **Align** work on the selection, or against the
prop's footprint when only one shape is selected. **Punch holes** combines shapes into a
compound path so overlaps cut through — a torus, a window, a ring.

**Prop settings** decide how it behaves once placed: footprint in grid squares, whether it
blocks line of sight, whether it lies flat under other props like a rug, whether rotation
snaps to quarter turns, and whether it emits light (with range and colour). A prop you make
here starts half a grid unit tall, so it picks up the same shadow, side face and contact
shading as the built-ins.

Everything is drawn in grid units, so a prop stays sharp at any export resolution — the
same drawing serves a 35 px preview and a 140 px print.

### Bringing in artwork from other tools

**Import SVG…** takes vector art from Illustrator, Inkscape, Affinity or Figma and converts
it into editable shapes — paths, rectangles, circles, ellipses, polygons and lines, with
their fills, strokes and opacity, baked through any group transforms. Curves stay curves:
beziers, quadratics and elliptical arcs all survive as editable anchor points. The artwork
is scaled to the footprint you've set and centred on it.

Convert text to outlines before exporting; text, embedded images and gradient definitions
are skipped, and the importer says so when it skips something.

**Import image…** takes a PNG, WebP or JPEG and makes it a picture prop. It places, turns
and scales like any other prop and can block sight or emit light, but it can't be edited as
shapes here. Keep it under 2 MB — it has to live in browser storage.

Start from **blank** or one of eight templates (round table, crate, barrel, rug, plinth,
banner, water pool). Saved props live in your browser's local storage and appear in a
**custom** tab in the prop picker. **Export pack** writes a `.forgeprops.json` you can
share; projects also embed the custom props they use, so a map you send someone opens with
its props intact.

Two things it deliberately doesn't do: true pathfinder booleans (unite/minus-front —
"punch holes" covers the common case via even-odd fill) and text. Neither is much use for
top-down props.

---

### Flying maps

Two terrain materials support aerial encounters: **Open Sky** and **Cloud**. Paint sky,
scatter cloud banks, drop a skyship on top, and you have a boarding action. Neither blocks
line of sight — they're air, not walls.

---

## Weather and time of day

Under **Appearance → Weather & time of day** is a single dropdown that regrades the whole
map: the same dungeon at noon, at midnight, in driving rain and under falling ash. There
are twenty settings —

**Clear · Golden hour · Night · Moonlit · Overcast · Fog · Rain · Storm · Snowfall ·
Blizzard · Sunbeams · Dusty air · Ashfall · Emberlight · Gloom and doom · Underdark ·
Feywild · Corruption · Red sky · Winter**

— and each one is a colour grade plus whatever falls out of the sky. Storm desaturates and
darkens, thins the air with haze, drives rain across at a slant and closes the edges in.
Sunbeams throws shafts from the same corner every prop on the map is already lit from, so
the beams and the shadows agree. Emberlight screens orange over everything and sends sparks
up. Underdark takes nearly all the colour out and leaves you only what your own torches
light.

**Strength** scales the lot, from a hint to overdone. Under it are four controls that work
on their own or on top of a preset: **saturation**, **contrast**, **warmth** (cold blue
through to warm orange) and **haze**, which lifts the blacks the way distance does.

Weather is seeded from the map, so the same storm falls in the same places every time —
export twice and you get the same image, not a reshuffle. It is painted into the exported
picture; the light *sources* still export separately, so a VTT that lights the scene itself
will light it through your fog.

---

## Grid shapes

The grid is no longer only squares. **Appearance → Grid shape** offers

| | |
|---|---|
| **Square** | 5 ft squares — the default, and what every VTT assumes |
| **Hex — pointy top** | one square across the flats, so a token covers the same ground |
| **Hex — flat top** | the same hex the other way up |
| **Isometric diamond** | two squares wide by one tall, for maps drawn in three-quarter view |

with **line weight**, **nudge X / Y** to line the lattice up with the art, and a **relief
line** — a second line in the opposite tone laid a hair below the first, which is what keeps
a black grid readable over black rock and a white one over snow.

Hex and isometric are a drawing convention, not a change to the map: cells, walls, doors and
every VTT export stay on the square grid underneath. What they give you is a printed sheet,
or an image for a VTT that draws its own hex overlay.

---

## Labels

The **Label** tool (`T`) writes on the map. Click to drop a label, then type into the
Labels panel — it is already focused. Click any existing label, with either the Label tool
or **Select**, to edit it; drag it to move it.

- **Font** — eight faces, drawn from what macOS and Windows already have, so nothing is
  fetched over the network: serif, old style, inscription, fantasy, script, sans, poster
  and typewriter. The dropdown previews each one in its own face.
- **Size** in grid units, so a 1.2 label is a bit over a square tall at any export
  resolution.
- **Colour**, **outline** and **outline width** — the outline is what makes type survive
  whatever colour the floor happens to be, and it is drawn as one pass over the whole label
  so tight tracking never lets one letter's outline eat the next letter's face.
- **Drop shadow**, to lift the type off the art.
- **Tracking** and **line height** — map labels are conventionally wide and sparse.
- **Angle** and **Curve**. Curve bends the line the letters sit on: positive bows the run
  over a hill, negative around a bay, so a river or a coastline can be named along its own
  line rather than across it.
- **Opacity**.

With nothing selected the panel sets what the *next* label will look like, so writing three
in the same hand takes one trip through the controls.

Labels are objects like any other: they live on the **Objects** layer, are lit and
weathered along with everything else on it, and burn into the exported image. Put them on
a layer above the *Light & weather* row if you want them to stay untouched by both. `Q`/`E` turn a selected label, `+`/`−`
resize it, `D` duplicates, `⌫` deletes, `esc` deselects. The Erase tool and right-click
remove one too.

---

## Layers

Everything the renderer draws used to happen in one fixed order. That order is right most
of the time, which is why it lasted, and wrong in exactly the places people care about.
So it is data now: the **Layers** panel is the stack, and the renderer walks it.

A new map ships with four layers, listed top of the stack first:

| | |
|---|---|
| **Grid** | The lattice |
| **Light & weather** | Baked light, the painted finish and the weather, in that order |
| **Objects** | Everything you place — props and labels |
| **Terrain** | The floor, walls, water and doors |

Four rows, one for each thing that is genuinely a layer. Light, the painted finish and the
weather share a row because each already has its own strength slider under Appearance —
a per-row opacity would have been a third way to say the same thing — and because nobody
reorders them separately. What that row is for is its **position**: everything below it is
lit and weathered, everything above it escapes all three. Want GM notes that stay legible
through fog? Put them on a layer above that row.

Every row that can move carries a **grip** on its leading edge; drag it, or focus the row
and hold `alt` with the arrow keys. Rows that cannot move — Terrain — leave the grip blank
rather than offering a handle they won't honour. Click a row to make it the layer new work
lands on, marked with a gold bar. The Prop tool and the Label tool each remember their own,
so switching tool doesn't make you re-pick. **Terrain is pinned to the bottom**; it can
still be hidden.

**Double-click a layer's name to rename it in place.** Only the layers you made or fill
yourself answer: Terrain, Light & weather and Grid are what they are, so they don't offer a
field that would refuse the change. Enter keeps it, escape drops it.

**Tag a layer a colour** from the swatches in its settings, and it gets a stripe down its
leading edge — the quickest way to find the GM layer in a stack of nine.

**Object layers** hold props and labels, and take an opacity *and* a blend mode — multiply,
screen, overlay, soft light, darken, lighten. Terrain and Light & weather show no opacity
slider: terrain is drawn straight onto an empty canvas so fading it reveals nothing but the
void, and the effects carry their strengths under Appearance. Add as many as you like, merge one down into
the one below, or delete one and everything on it. **Move selection here** sends the
selected prop or label to the open layer. **Solo** shows only that layer.

### Hiding a layer takes it out of the map

Not just out of the picture. A hidden layer's props stop blocking line of sight and its
torches stop giving light — in the editor, in the Universal VTT walls, and in the Foundry
scene. That is the point: put the traps, the secret doors and the GM's notes on their own
layer, and you have two exports off one map.

**Locking** leaves a layer drawn but lets the cursor straight through it. Lock the
undergrowth you scattered and it stops grabbing the pointer while you place the ambush.

### Selecting more than one row

The tree behaves like a file list. **Ctrl-click** (or ⌘-click) adds a row to the selection
or takes it out again; **shift-click** takes everything between the last row you touched
and this one. Layers and the things on them can be picked together.

With more than one row selected, **the eye and the padlock act on all of it** — hiding nine
layers is one gesture, not nine — and a bar appears under the stack with the count and a
delete that takes the lot. Terrain and the last remaining object layer are refused rather
than quietly skipped, and the toast says how many went.

---

## What is on a layer

A layer holds things, so the things live under it. Click the twisty on an object layer and
it unfolds into one row per prop and per label on it, indented under the layer, with a
thumbnail and a name. Once a wood has thirty trees in it, the one behind the rock is
findable in a list and not on the map.

Layers start folded, because an unfolded wood would bury the stack it is part of. The
count beside the name says how much is in there before you open it.

- **Click a row** to select that object. It becomes the live selection on the map, with its
  handles and toolbar, and the view scrolls to it if it was off screen. Selecting something
  on the map does the reverse: its layer unfolds and the tree scrolls to its row.
- **A thing gets the same controls its layer has.** Picking one row opens the same settings
  box a layer opens: its own **opacity**, its own **blend mode**, and its own **colour tag**.
  Double-click the row to **rename** it — clear the field to put back the name the prop
  library or the label's own text supplies.
- **The eye** hides one object — and like a hidden layer, a hidden object stops blocking
  sight and stops giving light.
- **The padlock** leaves it drawn but takes it out of the cursor's reach.
- **Search** at the top of the panel filters by name and unfolds every object layer, since
  a hit inside a folded layer is the same as no hit at all.

The two buttons beside the search box hide or lock **every row the tree is currently
showing** — so a folded layer is out of reach, and searching `torch` before pressing the
padlock locks the torches and nothing else.

### Ordering things by hand

Two things sitting on the same square are ordered automatically — flat things under
standing things, nearer things last — which is what makes a wood of forty trees overlap
correctly without anybody arranging it. When you want something specific, **drag its row**:
up the list is nearer the viewer, and dropping it inside another layer's block moves it
there.

Only what you actually drag gets pinned; everything else keeps sorting itself, so putting
one rug under one table doesn't freeze the depth ordering of the whole layer. The order is
saved with the project.

**Fading is a change to the picture only.** A prop at 20% still blocks line of sight and a
torch at 20% still gives light, in the editor and in every export — hiding is the control
that takes something out of the map. That split is deliberate: a ghost you can see through
should still stop an arrow.

The stack, the layer tags, the per-object flags and the hand-set order are all in the
project file. A project made before layers existed opens with the default stack and
everything on **Objects**.

---

## Water, ice and light

**Water flows.** Two caustic layers scroll across the surface at different scales and
speeds, and the surface streaks stretch along the current, so water reads as moving rather
than as a blue fill. **Current direction** and **speed** are in Appearance, and the preview
animates so you can aim the flow — turn *Animate water while editing* off if you'd rather
it sat still.

Exports are still images, so the current shows up as caustics and directional streaks
rather than motion. The pattern is deterministic: the same map exports the same water every
time.

**Lava creeps.** Molten rock gets a bright branching crack network drifting along the
flow, with a darker crust of cooled plates moving over it at a slower rate, so cracks open
and close as the plates part. The glow breathes slightly. Lava moves at a fraction of the
water speed, the way viscous rock should — the same direction and speed controls drive
both.

**Things resting on a liquid cast a contact shadow**, so a crate on lava or a table on
water reads as sitting on the surface rather than floating in it. A plain drop shadow gets
lost against moving caustics; the contact shadow doesn't.

**Rooms are lit because they are enclosed**, whether the enclosure is solid rock or thin
partitions, and each room's floorboard direction is keyed to where the room *is* rather
than to the order rooms happen to be found in. Both matter for one reason: placing
anything on the map should change that thing and nothing else.

**Walls cast shadow.** Every light is clipped to what it can actually see: a torch no
longer lights the room next door through the masonry. Solid rock, thin partitions and shut
doors all block it, and light still spills correctly through doorways and gaps. The shadow
shapes are cached and only recomputed when walls or lights move.

**Ice shines when light hits it.** Glossy surfaces get a specular highlight on top of the
ordinary light pool — tight, tinted toward the light's own colour, and far sharper in
falloff than the diffuse light. Ice takes it fully, water and deep water less, snow barely,
and matte surfaces like stone and wood not at all. Ice also picks up small glints that only
appear where a light actually reaches. A blue lantern on a frozen lake throws a cold sheen;
a campfire throws a warm one.

**Every light's colour is yours to set.** Select any prop that gives light — torch,
brazier, campfire, chandelier, crystal, magic circle — and the panel gains colour, reach
and strength controls for *that one prop*, with presets for Fire, Arcane, Fey, Necrotic and
Daylight. So one sconce can burn green while the next burns orange. **Reset** puts a prop
back to its default. The override travels into the Universal VTT and Foundry exports, so
your VTT lights the scene the same way.

---

## The sliders

The sliders are **contextual**: each map type shows only the ones it actually uses,
labelled for what they do to that kind of map. A tavern has no use for a lava slider, so
it doesn't show one. Switch map type and the panel relabels itself.

| Map type | What the sliders control |
|---|---|
| **Stone Dungeon** | Rooms · Room size & loops · Flooding · Clutter |
| **Crypt** | Chambers · Chamber size · Seepage · Grave goods |
| **Natural Cavern** | Open space · Chambers & passages · Pools · Lava · Formations |
| **Sewer** | Junction chambers · Tunnels · Channel width · Debris |
| **Tavern / Interior** | Seating · Back rooms · Clutter |
| **Town / Village** | Buildings · Streets · River · Street clutter |
| **Overgrown Ruins** | Ruined buildings · Masonry still standing · Ponds · Debris |
| **Forest** | Tree cover · Trails & glades · Stream · Undergrowth |
| **Swamp** | Dry ground · Walkways · Water level · Vegetation |
| **Desert** | Rock outcrops · Buried ruins · Oasis · Scatter |
| **Frozen Wastes** | Rock outcrops · Crevasses · Frozen lakes · Scatter |
| **Volcanic Caldera** | Solid footing · Fissures · Lava flow · Scatter |
| **Coast** | Beach width · Ragged coastline · Sea level · Scatter |
| **Ship Deck** | Hull beam · Superstructure · Depth of water · Cargo |
| **Arena** | Obstacles · Size & gates · Flooding · Dressing |

They're meant to reach genuine extremes rather than nudge things. Some examples of the
same seed at 0 versus 1:

- Dungeon **Rooms**: a three-room hideout → a sprawling twenty-room complex
- Dungeon **Flooding**: bone dry → knee-deep through most of the floor
- Cavern **Open space**: a cramped winding crawl → a vast open cathedral
- Forest **Trails**: trackless wood → criss-crossed with paths and glades
- **Clutter** on a dungeon: 7 props → 86; on a town, 3 → 74

If a map type takes no settings at all — the blank canvases — the panel says so rather
than showing dead controls.

---

## Saving your work

**Save project** writes a `.forge.json` holding the terrain, every prop, door and light,
and your settings — reopen it later with **Open project** and carry on. It's a plain text
file, so it version-controls and syncs fine.

One caveat: a traced background image is *not* stored in the project file (it would
balloon the file size). Reload the image and your traced walls will still be there.

---

## What the export files contain

**Image** — the finished map. PNG is lossless and large; WebP is usually 15× smaller at
effectively the same quality; JPEG is the most compatible small option.

**Universal VTT (`.dd2vtt`)** — the de-facto interchange format, the same one Dungeondraft
exports. A single JSON file holding the map image as base64 plus:
- `line_of_sight` — wall runs in grid units, merged so a 20-square wall is one segment
  rather than twenty
- `portals` — doors, with position and swing axis
- `lights` — position, radius, colour and intensity
- `resolution` — grid size and map dimensions

**Foundry scene (`.scene.json`)** — a scene document with walls in pixel coordinates, doors
flagged as door walls (secret doors as secret), and lights with sensible dim/bright radii
in feet. Import it, then point the scene's background at the image you exported.

---

## Notes

- Pillars, statues and trees block line of sight. Turn that off in Export if you'd rather
  they didn't.
- "Wall off the map border" fences the edge of the map so tokens can't wander off. On by
  default.
- Baked lighting looks good in a static image but fights a VTT's own dynamic lighting.
  Turn it off before exporting if your VTT lights the scene itself — the light *sources*
  are exported either way.
- The largest supported export is 8192 px on a side.

---

## If something misbehaves

- **A download opens in a new tab instead of saving** — Safari sometimes does this for
  pages opened from a `file://` path. Open the tool in Chrome, Edge or Firefox, or serve
  the folder over `http` (`python3 -m http.server` inside the BattlemapForge folder, then
  visit `localhost:8000`).
- **Export refuses at high resolution** — the ceiling is 8192 px on a side. Drop the export
  resolution, or make the map smaller in squares.
- **Foundry shows the scene but no artwork** — the scene file points at a filename, not a
  copy of the image. Put the exported image where the scene expects it, or fix the path in
  the scene's configuration.

---

## Files

```
index.html        the app — open this
css/style.css     interface styling
js/core.js        seeded RNG, noise, terrain materials, map model, edge walls
js/shading.js     the light direction, prop heights, and the shadow/side/contact model
js/props.js       the core prop library (every object is drawn in code, not an image)
js/props-fantasy.js  grand statuary, arcane apparatus, chandeliers, rugs, vehicles
js/rooms.js       prefab furnished rooms
js/generate.js    the map generators
js/render.js      the renderer, including the grid lattices
js/atmosphere.js  weather, time of day and colour grading
js/labels.js      text on the map
js/layers.js      the draw stack, the per-object flags and the sublayer order
js/exporters.js   wall extraction and the VTT file formats
js/app.js         interface, tools, undo, export wiring

tools/prop-contact-sheet.html   every prop, same size, same floor, same light
```

`js/shading.js` is the file to read before changing how props look. It holds the one light
direction the whole library is lit by, the fallback heights per category, and the cache of
traced prop silhouettes the shading is built from. Open `tools/prop-contact-sheet.html`
after touching it — it draws all 124 props side by side on the same floor under the same
light, so a wrong height or a shadow pointing the wrong way is obvious at a glance.

Nothing is minified and there are no dependencies, so it's all editable. Adding a prop is
one `defProp` call in `js/props.js`; adding a whole map type is one `defGen` call in
`js/generate.js`.
