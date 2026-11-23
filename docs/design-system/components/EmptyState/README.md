# EmptyState

When a step has nothing to show yet, Mimi says what will appear and offers the first action. One Mimi pose, a `title` line, one sentence and one button.

- No lights yet → `mimi-sleep`: "Add a light and Mimi will plan the wiring."
- Working (compiling, nesting) → `mimi-working`.
- Export finished → `mimi-done`.
- Something failed → `mimi-oops`, with what to do next.

The consumer provides the pose, the words and the action. Mimi never appears on a screen that already has content.
