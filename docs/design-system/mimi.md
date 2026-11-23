# Mimi

Mimi is a little chipboard box that makes kits with you. Every part of Mimi is something mimimaker makes:

| Part | What it is |
| --- | --- |
| Finger-joint top | The joints mimimaker cuts so boxes lock together |
| Lit-window eyes | Windows cut out of walls, glowing with LED light |
| LED antenna | The lights you plan on the Light step |
| Dashed belt | A score line, where card folds |
| Glue-tab feet and arms | The tabs on fold-up cardstock pieces |

## Poses

| Pose | File | When |
| --- | --- | --- |
| Hello | `mimi-hello.svg` | Start screen, first run |
| Idle | `mimi-idle.svg` | About, help, the logo lockup at large size |
| Working | `mimi-working.svg` | Packing sheets, building the zip (over 1 second) |
| Done | `mimi-done.svg` | Kit downloaded, all checks passed |
| Oops | `mimi-oops.svg` | Something failed; always next to what to do |
| Sleep | `mimi-sleep.svg` | Empty states: no lights, no pieces, no sheets |

## Rules

- **At most one Mimi per screen**, at 64–120px, in an EmptyState or a dialog. Never in the header, the tool rail, cards, tables or next to numbers.
- **Mimi doesn't talk.** No speech bubbles and no first person. The words around Mimi are the app's voice.
- **Mimi never blames.** Use `mimi-oops` with a calm sentence and a fix, never with "you" did something wrong.
- **Draw only the six poses.** Don't recolour, stretch, add accessories or redraw Mimi in another style. New poses keep the 3px `ink` outline, the `kraft` body and the six parts above.
- Mimi is the same in both themes: the kraft body reads on `paper` and on the dark `paper`.
