# mimimaker

Design miniature room kits — think DIY book nooks and room boxes — and export
Cricut-ready cut files, a parts list and an assembly guide.

You describe the room (size, scale, windows and doors, wallpaper) and drop in
furniture from a parametric catalogue. mimimaker generates every part, joins
them so they fit together, numbers them, packs them onto mats for your machine
and material, and bundles it all into a `.zip`.

![3D preview, cut sheets and guide](docs/screenshot.png)

## Running it

No build step and no dependencies — it's plain ES modules.

```bash
npm start
```

then open <http://localhost:5173>. (Any static file server works; it just
can't be opened straight from `file://` because browsers block module imports
there.)

```bash
npm test
```

runs the unit tests with Node's built-in test runner (Node 18+). Browser tests
for the studio UI (floor plan, undo, night mode, fit test, share links, phone
layout) use Playwright with Chromium:

```bash
npm run test:e2e
```

New features are written test-first: add a failing test, then the code.

To get a single self-contained HTML file (all CSS/JS inlined, opens from
`file://` or any host), run:

```bash
npm run build
```

It writes `dist/mimimaker.html`.

### GitHub Pages

`.github/workflows/pages.yml` runs the tests and publishes the site on every
push to `main` (or from the Actions tab via *Run workflow*). One-time setup:
**Settings → Pages → Build and deployment → Source: GitHub Actions**.
The app is then at `https://<user>.github.io/mimimaker/` (published as one
bundled page, so browsers never mix old and new files), with the
single-file build at `…/mimimaker/mimimaker.html`.

## What it makes

| Material kind | Examples | How boxes are built |
| --- | --- | --- |
| **Board** | chipboard 1.5/2 mm, basswood 0.8/1.6 mm | Finger-jointed panels sized to the material thickness; shelves use tab-and-slot joints. Needs the Knife Blade (Cricut Maker). |
| **Card** | cardstock, patterned paper | Fold-up nets with score lines and glue tabs. If a net won't fit the mat it's split into separate tabbed panels. Works on any Cricut. |
| **Fabric** | felt | Flat pieces only (rugs). Rotary Blade. |

**Room types** — start from a furnished room and edit from there: reading
nook, cozy bedroom, cottage kitchen, bathroom, little café, living room,
library & study, attic studio. Each comes with its own furniture, openings,
lights and paper colours.

**Piece library** (pick by theme, with 3D thumbnails):

| Theme | Pieces |
| --- | --- |
| Basics | bookshelf, cabinet/dresser, table, chair, bench/coffee table, desk |
| Living room | sofa, armchair, fireplace (arched opening + mantel), media unit, floor lamp |
| Bedroom | bed with headboard, nightstand, chest of drawers, wardrobe |
| Kitchen | base cabinet, sink unit, stove (scored burners/oven), fridge, wall cabinet, open wall shelf |
| Bathroom | bathtub, vanity with basin cut-out, toilet |
| Café | shop counter, bar stool, café table, display shelving, menu board |
| Library | library ladder, book stack |
| Decor | rug, potted plant, picture frame, round mirror/clock, wall TV, curtains |

Plus the room box itself (optional ceiling), rectangular / arched / round
windows, doors and arched doors with trim frames, and wallpaper and floor
overlays cut to match the openings.

**Studio tools**
- **Floor plan** tab: drag furniture around the room (snaps to a 5 cm grid; hold Alt
  for free placement), slide windows, doors, wall pieces and wall lights along
  their walls. Overlapping pieces are outlined in red. Shortcuts: R rotate,
  D duplicate, Delete, arrow keys nudge (Shift for 10 cm).
- **Undo / redo** for every change (Ctrl/⌘ Z, Ctrl/⌘ Shift Z).
- **Night mode** in the 3D preview to see the LEDs glow.
- **Fit test** (Make tab): cut a small comb for each board you use, push a scrap
  into the numbered slots and click the snug one; every joint re-sizes to your
  actual board.
- **Cut-time estimates** and the matching Cricut Design Space material setting
  for every sheet.
- **Share links**: the whole design is compressed into the link, so anyone can
  open their own copy. Free, no account, no server.

 — place micro LEDs on the walls, ceiling or floor (e.g.
inside a floor lamp or fireplace). mimimaker cuts a wire hole through the
panel and its wallpaper at each light, plans a route for every wire along
the outside of the box to a battery box or USB lead (avoiding windows and
doors where it can), and tells you the minimum lead length for each LED.
The **LED map** tab and the guide show the room unfolded and seen from
behind, the side you wire on; the map is also in the zip as `led-map.svg`.

All sizes are entered in real-world centimetres and scaled (1:6 to 1:87).

## Using the cut files in Cricut Design Space

Each sheet is an SVG in millimetres with colour-coded layers:

- **black** — Cut
- **magenta** — Score (fold lines and glue-tab folds)
- **blue** — Pen (part numbers, if "Draw part numbers" is on)

Upload the SVG, insert it at its original size, ungroup, set each colour's
operation, then select everything and **Attach** so score/pen lines stay on
their parts. The generated assembly guide repeats these steps.

## How the joinery works

`src/box.js` draws each panel at its full outer size. Along every shared edge
the material-thick strip is split into an odd number of fingers; the panel with
the higher rank (floor/ceiling > front/back > sides) keeps the end fingers.
Because the ranking is a strict order, each corner cube ends up in exactly one
panel. The tests check this: for every combination of faces, the panel areas ×
thickness equal the exact volume of the assembled walls.

`src/fold.js` unfolds the faces of a box along a spanning tree from a base
face. Tree edges become score lines and every other shared edge gets a
trapezoid glue tab on the face that folds last.

## Project layout

```
index.html, styles.css   UI shell
src/app.js               UI controller (state, forms, downloads)
src/kit.js               compiles a kit → parts, 3D faces, steps, sheets, warnings
src/catalog.js           themed furniture/decor pieces
src/templates.js         room types (starter layouts)
src/lighting.js          LED wire holes and wire routing
src/ledmap.js            LED wiring map SVG
src/box.js               finger-jointed boxes and shelves
src/fold.js              fold-up nets and glue tabs
src/geometry.js          polygons, edge profiles, arches, segment chaining
src/nest.js              shelf packing onto sheets
src/svg.js               Design Space SVGs and sheet previews
src/labels.js            part-number placement and a pen-friendly digit font
src/preview3d.js         SVG 3D preview
src/guide.js             printable assembly guide
src/zip.js               tiny zip writer for the kit download
```

## Known limitations / next steps

- Measure your board: finger joints assume the thickness in the Materials
  table. There's no kerf compensation yet (the Knife Blade's is tiny).
- Nesting is rectangle-based (shelf packing), so oddly shaped parts waste some
  space. Design Space will also re-lay-out parts unless you Attach them.
- No print-then-cut yet. Wallpaper and floors are cut from pre-printed paper
  rather than printed with patterns.
- Ideas: a more detailed furniture catalogue (sofas, kitchen units, stairs),
  book nook shells with a slanted roof, LED channels, and custom part shapes
  from uploaded SVGs.
