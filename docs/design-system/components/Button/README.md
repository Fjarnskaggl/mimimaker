# Button

Buttons do one thing, named by a verb in sentence case: "Download kit", "Cut sheets", "Add light".

- **primary** (`primary` fill, `on-primary` text, `shadow-raise`): the one action the current step is for, an ink sticker by day and caramel at night. At most one per view: "Download kit" on Make, "Add to room" in the library.
- **secondary** (default): everything else that needs a box. A 2px `ink` edge on `surface`, with hand-cut corners (`radius-cut-md`).
- **quiet**: toolbar and inline actions; use `icon` with an `aria-label` for icon-only buttons.
- **danger** (`danger` text): destructive actions, always confirmed by a second click or an undo toast. Never a red fill.
- **sm** (`control-h-sm`) inside panels and cards; default size (`control-h`) in the header and dialogs.

The consumer provides the label (or icon + `aria-label`) and the action. Glow is never a button colour: it belongs to light.
