# Field

A labelled input. Numbers are set in `measure` (mono, tabular) with their unit inside the box: **cm** for real-world sizes the user thinks in, **mm** for model and cutting sizes. When both matter, show the real size in the input and the model size in the hint ("75 mm on the model").

- Label: `label` style, `ink-muted`, a noun ("Width", "Gap depth").
- Hint: `small`, `ink-muted`, one line explaining a non-obvious value ("Measured from the back wall").
- Input: a `surface-sunken` well cut into the card, with a 2px `ink` rule underneath (the control edge) and square bottom corners.
- Locked (`.is-locked`): no well, a dashed `line-control` edge, plus a hint saying who owns the value ("Set by the shelf gap").
- Group related numbers in a `.mm-row` (2 or 3 columns); never more than three across.

The consumer provides label, value, unit, hint and the change handler.
