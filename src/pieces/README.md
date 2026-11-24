# Declarative pieces

Every furniture or decor piece is plain JSON data — no code — so new pieces can
be added without touching the engine. `piece.schema.json` describes the shape
(editors can use it for completion); `validatePiece()` in `schema.js` also
checks the meaning: expressions parse and use only names in scope, defaults
sit inside their ranges, and floor/wall rules hold.

```json
{
  "id": "sofa", "label": "Sofa", "theme": "Living room",
  "placement": "floor", "mat": "board",
  "params": [
    { "key": "w", "label": "Width", "type": "number", "min": 80, "max": 320, "step": 1, "unit": "cm" },
    { "key": "arm", "label": "Arm width", "type": "number", "min": 8, "max": 40, "unit": "cm" }
  ],
  "defaults": { "w": 200, "arm": 18 },
  "size": ["w", "d", "max(back, armh)"],
  "let": { "a": "min(arm, w / 3)", "dd": "d - t" },
  "components": [
    { "kind": "box", "name": "Seat", "size": ["w - 2 * a", "dd", "seat"], "faces": "all", "at": ["a", 0, 0] },
    { "kind": "flat", "name": "Back", "polys": [{ "arch": [0, 0, "w", "back"] }], "plane": { "upright": { "y": "dd" } } }
  ],
  "note": "Glue the arms to the seat ends, then the back across all three."
}
```

## Library metadata

Every catalogue piece also has `tags` (lower-case search words such as
`storage`, `seating`, `wall-mounted`) and a `difficulty` of 1 (Easy),
2 (Medium) or 3 (Tricky). Part counts are not written by hand:
`partCount()` in `meta.js` compiles the piece to count them, so they always
match the cut files. `searchPieces(query, { theme, tag, difficulty })` and
`allTags()` feed the piece library.

## Numbers are expressions

Anywhere a number goes you may write a string expression (`src/pieces/expr.js`):
`+ - * / %`, comparisons, `&& || !`, `a ? b : c`, `'strings'`, and
`min max round floor ceil abs sqrt clamp sin cos` (radians), `hash(k, seed)` (a repeatable pseudo-random number in [0, 1) for seeded variety), `PI`. Names in scope:

- every parameter (`unit: "cm"` values arrive already scaled to model mm),
- `t` — the material thickness in mm,
- `mf` — the smallest strip or tab the cutter makes cleanly in this material, in mm (knife 3, fine blade 1.5, laser 1). Size thin parts with it, e.g. `max(mf, w * 0.1)`, so a piece cuts cleanly in board as well as card.
- `board` — 1 when the piece is cut from board (jointed or laminated), 0 for card; a board part needs more room round a slot than a folded card net.
- `let` names, in order (each may use the ones before it),
- a `repeat`'s loop variable and its own `let`s, inside that repeat.

There is no `eval`; unknown names and functions are errors.

## Components

| kind | fields |
| --- | --- |
| `box` | `name`, `size: [w, d, h]`, `faces: "all"` or a list of `bottom top front back left right`, optional `at`, `shelves` (`{ "even": n, "h": height, "top": true }` or a list of heights), `scores` and `holes` keyed by face, `solid: true` (laminated from layers stacked across its thinnest side; board blocks too thin to joint are laminated anyway) |
| `flat` | `name`, `polys` (first shape = outline, the rest = holes), optional `scores`, `at`, `surface`, and either `plane` (floor pieces) or `wall: true` (wall pieces) |
| `rod` | `name`, `stock` (`dowel`, `wire` or `tube`), `d` (diameter, mm), `from` and `to` (end points), optional `at`. Bought round stock cut to length: not on the cut sheets, drawn in 3D and listed in the bill of materials. Floor pieces only. |

Planes: `{ "upright": { "x", "y", "z" } }` stands the part up facing the
front at depth `y`; `{ "floor": { "z" } }` lays it flat;
`{ "custom": { "o", "U", "V", "n" } }` for anything else.

Shapes: `rect [x, y, w, h]`, `arch [x, y, w, h, r?, seg?]`,
`ellipse [cx, cy, rx, ry, seg?]`, `circle [cx, cy, r, seg?]`, `plant [w, h, lobes?, stemW?, stemH?, slit?, shoulder?]` (a stem tab stemH tall under the leaves; a cross-lap slit from the top when slit > 0, from the bottom when < 0, which can't be combined with a stem; `shoulder` is the square shoulder beside the slit, default 1.5, pass `mf`),
`drape [x, w, h]`, `poly [[x, y], …]`.

Scores: `line [[x, y], [x, y]]`, `loop [[x, y], …]`, `rect`, `circle`
(20 segments by default), `ellipse`, and
`fronts { style, count, w, h, from?, to? }` for drawer/door gaps.

Any component, shape or score may carry `"when": "<expr>"` (left out when
false) or be wrapped in a repeat:

```json
{ "repeat": "round(count)", "as": "k", "let": { "f": "1 - 0.08 * (k % 3)" },
  "each": { "kind": "box", "name": "Book {k + 1}", "size": ["w * f", "d * f", "h"], "faces": "all", "at": [0, 0, "k * h"] } }
```

Names may contain `{expr}` placeholders.

## Every part must be held

`test/buildable.test.js` compiles every piece at its default, smallest and
largest sizes and fails when a part floats (touches nothing that leads to the
floor or wall) or runs through the middle of another part, and at the default
size when a strip of material is narrower than the cutter manages. So:

- a shade, top or shelf needs something real under it: a stem (`rod`) with a
  spider or socket, legs, slots or a glue face;
- a part that goes into another goes through a hole or slot cut for it
  (`holes`), or two flats cross-lap with slits cut in both;
- strips stay at least as wide as the cutter's smallest clean feature
  (`MIN_FEATURE` in `src/box.js`: 3 mm for the Knife Blade in board, 1.5 mm
  for the Fine-Point Blade in card).

The audit behind this is in `docs/audits/buildability.md`.
