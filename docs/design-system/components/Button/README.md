# Button

Buttons do one thing, named by a verb in sentence case: "Download kit", "Cut sheets", "Add light".

- **primary** (`mat` fill, `on-mat` text): the one action the current step is for. At most one per view: "Download kit" on Make, "Add to room" in the library.
- **secondary** (default): everything else that needs a box.
- **quiet**: toolbar and inline actions; use `icon` with an `aria-label` for icon-only buttons.
- **danger** (`danger` text): destructive actions, always confirmed by a second click or an undo toast. Never a red fill.
- **sm** (`control-h-sm`) inside panels and cards; default size (`control-h`) in the header and dialogs.

The consumer provides the label (or icon + `aria-label`) and the action. Glow is never a button colour: it belongs to light.
