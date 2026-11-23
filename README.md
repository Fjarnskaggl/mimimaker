<p align="center">
  <img src="docs/design-system/assets/Mimi/mimi-hello.svg" alt="Mimi, the mimimaker mascot: a little chipboard box waving hello" width="120">
</p>

<h1 align="center">mimimaker</h1>

<p align="center">
  Design miniature room kits and book nooks, then export cut files,<br>
  a parts list, a lighting plan and an assembly guide.
</p>

---

You describe the room (size, scale, windows and doors, wallpaper) and drop in
furniture from a parametric catalogue. mimimaker generates every part, joins
them so they fit together, numbers them, packs them onto sheets for your
machine and material, and bundles it all into a `.zip`.

Free for everyone: no accounts, no servers, no paid dependencies. It runs as a
static site.

![3D preview, cut sheets and guide](docs/screenshot.png)

## Contents

- [Quick start](#quick-start)
- [Features](#features)
- [Using the cut files](#using-the-cut-files)
- [How the joinery works](#how-the-joinery-works)
- [Project layout](#project-layout)
- [Contributing](#contributing)
- [Known limitations](#known-limitations)

## Quick start

No build step and no install. It's plain ES modules, and Node 18+ is only
needed for the dev server and tests.

| Command | What it does |
| --- | --- |
| `npm start` | Serves the app at <http://localhost:5173>. Any static server works; `file://` doesn't, because browsers block module imports there. |
| `npm test` | Unit tests (Node's built-in test runner). |
| `npm run test:e2e` | Browser tests with Playwright and Chromium. |
| `npm run build` | Writes `dist/mimimaker.html`, a single self-contained page that opens from `file://` or any host. |

### Deploying to GitHub Pages

`.github/workflows/pages.yml` runs the tests and publishes the site on every
push to `main` (or by hand from the Actions tab with *Run workflow*). One-time
setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The app is then at `https://<user>.github.io/mimimaker/`, published as one
bundled page so browsers never mix old and new files. The single-file build
is at `…/mimimaker/mimimaker.html`.

## Features

The studio works in four steps: **Design**, **Light**, **Make** and **Build**.
All sizes are entered in real-world centimetres and scaled from 1:6 to 1:87.

### Rooms and book nooks

- **Room types** to start from, each with its own furniture, openings, lights
  and colours: reading nook, cozy bedroom, cottage kitchen, bathroom, little
  café, living room, library & study and attic studio.
- **Book nook shells** sized to slide into a real shelf gap: open book nook,
  alley with lit facades, bookshop corner, staircase to a landing and
  greenhouse.
- **Room box** with an optional ceiling or gable roof; rectangular, arched and
  round windows; doors and arched doors with trim frames; wallpaper and floor
  overlays cut to match the openings.

### Piece library

Pick by theme, with 3D thumbnails. Pieces are parametric, so they resize to
your room.

| Theme | Pieces |
| --- | --- |
| Basics | bookshelf, cabinet/dresser, table, chair, bench/coffee table, desk |
| Living room | sofa, armchair, fireplace, media unit, floor lamp |
| Bedroom | bed with headboard, nightstand, chest of drawers, wardrobe |
| Kitchen | base cabinet, sink unit, stove, fridge, wall cabinet, open wall shelf |
| Bathroom | bathtub, vanity with basin cut-out, toilet |
| Café | shop counter, bar stool, café table, display shelving, menu board |
| Library | library ladder, book stack |
| Decor | rug, potted plant, picture frame, round mirror/clock, wall TV, curtains |

### Materials and machines

| Material kind | Examples | How parts are built |
| --- | --- | --- |
| **Board** | chipboard 1.5/2 mm, basswood 0.8/1.6 mm | Finger-jointed panels sized to the material thickness; shelves use tab-and-slot joints. |
| **Card** | cardstock, patterned paper, clear acetate | Fold-up nets with score lines and glue tabs. Nets too big for the mat are split into tabbed panels. |
| **Fabric** | felt | Flat pieces only (rugs). |

Machines: Cricut Maker, Explore, Joy and Joy Xtra; Silhouette Cameo and
Portrait; and a generic laser cutter (kerf-compensated SVG and DXF). Every
kit can also be printed as hand-cut templates (A4 or US Letter PDF) to cut
with a craft knife.

### Lighting

Place LEDs on the walls, ceiling or floor (for example inside a floor lamp or
fireplace): steady micro LEDs, candle flicker LEDs, fairy-light strings or
LED strip. mimimaker cuts a wire hole through each panel and its wallpaper,
routes every wire along the outside of the box to a battery box or USB lead
(around windows and doors where it can), gives the minimum lead length for
each LED and a shopping list with rough prices.

The **LED map** shows the room unfolded and seen from behind, the side you
wire on. It's also in the zip as `led-map.svg`.

### Studio tools

- **Floor plan**: drag furniture around the room (snaps to a 5 cm grid; hold
  Alt for free placement) and slide windows, doors, wall pieces and lights
  along their walls. Overlapping pieces are outlined in red. Shortcuts: R
  rotate, D duplicate, Delete, arrow keys nudge (Shift for 10 cm).
- **Undo / redo** for every change (Ctrl/⌘ Z, Ctrl/⌘ Shift Z).
- **3D preview** with soft shadows, material textures and a night mode that
  shows the LEDs glowing.
- **Fit test** (Make step): cut a small comb for each board you use, push a
  scrap into the numbered slots and pick the snug one; every joint re-sizes
  to your actual board.
- **True-shape nesting** packs parts by their real outlines, so small parts
  drop into window cut-outs.
- **Cut-time estimates** and the matching machine material setting for every
  sheet.
- **Build mode**: step-by-step assembly with parts to tick off and glue
  timers, saved in your browser.
- **Share links**: the whole design is compressed into the link, so anyone can
  open their own copy. No account, no server.

## Using the cut files

Each sheet is an SVG in millimetres with colour-coded layers:

- **black**: Cut
- **magenta**: Score (fold lines and glue-tab folds)
- **blue**: Pen (part numbers, if "Draw part numbers" is on)

In Cricut Design Space, upload the SVG, insert it at its original size,
ungroup, set each colour's operation, then select everything and **Attach**
so score and pen lines stay on their parts. The zip's assembly guide repeats
these steps. Silhouette and laser kits get their own files (DXF as well as
SVG) and a `README.txt` in the zip on how to use them.

## How the joinery works

`src/box.js` draws each panel at its full outer size. Along every shared edge
the material-thick strip is split into an odd number of fingers; the panel
with the higher rank (floor/ceiling > front/back > sides) keeps the end
fingers. Because the ranking is a strict order, each corner cube ends up in
exactly one panel. The tests check this: for every combination of faces, the
panel areas × thickness equal the exact volume of the assembled walls.

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
src/materials.js         materials and machines
src/make.js              cut-time estimates and machine settings
src/share.js             share links
src/pieces/              piece definitions by theme (see its README)
src/shells/              book nook shells (nook, alley, bookshop, staircase, greenhouse)
src/export/              machine files (laser, Silhouette), hand-cut PDFs, true-shape nesting
src/build/               build mode: steps, joints, progress
src/lighting/            LED effects, circuits, cut-outs, shopping list
src/render/              WebGL 3D viewer (three.js)
src/textures/            procedural textures (wood, tiles, brick, wallpaper)
src/ui/                  per-workstream panels and design-system art
docs/design-system/      design system assets (Mimi)
docs/threads/            how the workstreams are organised
```

## Contributing

Work is split into parallel workstreams; the rules are in
[docs/threads/README.md](docs/threads/README.md) and the roadmap is tracked
in [#1](https://github.com/Fjarnskaggl/mimimaker/issues/1). In short: write a
failing test first (CI checks this with `npm run check:test-first`), keep PRs
small, and use original designs only.

## Known limitations

- **Measure your board.** Finger joints assume the thickness in the materials
  table. Cutting-machine files have no kerf compensation (the Knife Blade's
  kerf is tiny); laser files do.
- **Design Space re-lays out parts** unless you Attach them after uploading.
- **No print-then-cut sheets yet.** Wallpaper and floors are cut from
  pre-printed paper; the procedural textures currently show in the 3D
  preview only.
