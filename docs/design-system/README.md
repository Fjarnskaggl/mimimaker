# mimimaker design system

> **In this repo.** The design system for the app: principles and voice (this page), the flow (`flow.md`), Mimi (`mimi.md`), tokens (`tokens.css`, `tokens.json`), components (`components/<Name>/README.md`, with a `preview.html` you can open in a browser and the shared `components/bundle.css`), and the icon, logo and Mimi SVGs (`assets/`). UI work follows it. `test/design-tokens.test.js` checks that the variables in `styles.css` match `tokens.json`, so change both together.

mimimaker turns a room idea into a miniature kit you can cut on a Cricut or laser, light with LEDs and build at the kitchen table. The interface should feel like a tidy workbench: the model in the middle, the right tool within reach, everything else put away.

## Principles

1. **The model is the hero.** The stage takes the space. Chrome is quiet `surface` and `line`; colour belongs to the model and the materials.
2. **One thing at a time.** Show settings only for the selected thing (the Inspector). A step shows only its own tools. Rarely used settings live under **Advanced**.
3. **Measure twice.** Every number is set in `measure` with its unit. Real-world sizes in cm, model and cutting sizes in mm, never mixed in one field.
4. **Warm light is special.** `glow` appears only for LEDs and the Light step. It is never a button, never text, never decoration.
5. **Made by hand.** Kraft and basswood swatches, finger-joint edges and Mimi make it feel crafted, used sparingly so the work stays the focus.

## Content fundamentals

- **Voice:** a friendly expert at the next workbench. Short, concrete, encouraging. Explain craft terms the first time: "kerf (the width the blade removes)".
- **You and we:** address the maker as *you*. The app doesn't say *I*; Mimi never speaks in the first person either. Write "Add a light and Mimi will plan the wiring", not "I'll plan your wiring!"
- **Sentence case** everywhere: buttons, headings, tabs. Never all caps except the `overline` marker.
- **Buttons are verbs:** "Download kit", "Cut sheets", "Add light", "Calibrate". Never "OK" or "Submit".
- **Problems say what to do:** "Back wall is 318 mm; the Maker cuts up to 292 mm. Use a 12×24 mat." Never blame ("You made the room too big").
- **Numbers:** a space before units (`180 cm`, `2.10 mm`), `×` for sizes (`279 × 279 mm`), `≈` for estimates (`≈ 1 h 52 min`), and every estimate says it is one.
- **No emoji.** Icons carry meaning; Mimi carries the feeling.

| Instead of | Write |
| --- | --- |
| Finger joints are only 2.2 mm wide — the Knife Blade is cleaner above 3 mm. Make it bigger, raise the finger width, or use thinner board. | **Thin fingers.** Shelf tabs are 2.2 mm; cleaner above 3 mm. [Widen] |
| Loaded the little café — everything is editable below. | Corner Café loaded. Click any piece to change it. |
| Download kit (.zip) | Download kit |

## Visual foundations

**Colour.** Page `paper`, panels `surface`, wells and the stage `surface-sunken`. Text `ink`, secondary `ink-muted`. `mat` is the brand: the one primary button, the active step, selection outlines and the focus ring in light theme. Materials show as `kraft` and `basswood` swatches. Status uses `success` (blue), `warning` (amber) and `danger` (red-orange), each with its `-soft` tint and always with an icon and a word. Two themes: **Workbench** (light) and **Night workshop** (dark). Every text pair named in a token's usage meets 4.5:1 in both, and controls and focus meet 3:1.

**Type.** Three families, each with one job:
- **Bricolage Grotesque** (`display`): names and moments. "Bricolage" means building from what's at hand. Use `display` for the kit name, `title` for the selected thing, `display-xl` only on the start screen.
- **Figtree** (`sans`): the interface, in `body`, `heading`, `label` and `small`.
- **IBM Plex Mono** (`mono`): every measurement, count and time, in `measure` and `numeral`, with tabular figures.

**Space and layout.** 4px base (`space-1`…`space-7`). The app shell is fixed: header (`topbar-h`) with the StepNav; a tool rail (`rail-w`) on the left that opens the library drawer (`drawer-w`); the stage; the Inspector (`inspector-w`) on the right. At most one drawer and one inspector are open. Under 900px wide, the inspector becomes a bottom sheet.

**Shape.** `radius-sm` for inputs and chips, `radius-md` for buttons, cards and notices, `radius-lg` for panels, the stage and sheets, `radius-pill` for pills and toasts. Panels sit on `line` hairlines; only floating things (popovers, drawer, toasts, a dragged piece) get `shadow-float`.

**States.** Hover darkens to `surface-sunken`. Selected things get a 2px `mat` outline on the stage and a `mat-soft` row in lists. Clashes on the floor plan get a `danger-soft` fill and a dashed `danger` outline. Locked fields get a dashed edge on `surface-sunken` and a hint saying who owns the value. Focus is a 2px `focus` ring with a 2px offset, on every interactive element.

**Motion.** 120ms ease-out for hovers and toggles, 220ms for drawers and sheets, no bounce. Lights fade on over 400ms in night mode. With `prefers-reduced-motion`, everything snaps.

**The finger joint** is the signature shape: two boards meeting with interlocking teeth. Use it in illustrations, the cover and Mimi's head. Never use it as a border on UI panels.

## Iconography

A custom 20px set, drawn on a 20px grid with a 1.75px stroke and round caps and joins, inheriting `currentColor` when inlined (the files in the Icons group are drawn in `ink`). Icons always sit beside a word, except in the tool rail and on icon-only buttons, which have an `aria-label`. No emoji, and no filled or duotone variants. The set covers the app's verbs and objects: plan, cube (3D), bulb, knife (cut), joint (build), ruler, sheets, check, alert, info, undo, redo, link, download, plus, search, sliders (advanced), close, chair (pieces) and window (openings).

## Logo

The mark is Mimi's head on its own: a kraft box with a finger-joint top, two lit windows and the LED antenna (Logos group). Next to the mark, set the name `mimimaker` in lowercase Bricolage Grotesque 800, `ink`, at 1.25× the mark's height. Never recolour the mark, outline it or put it on `mat`.

## Mimi

Mimi is the mascot, a little chipboard box that makes kits with you. See the Mimi section for the anatomy, the poses and when Mimi appears. In short: at most one Mimi per screen, only in empty, working, success and error moments, never in toolbars or next to data.
