# Buildability audit (2026-11-24)

Can every piece really be made from its cut parts? Each catalogue piece was
compiled at its default, smallest and largest sizes (1:24, Maker with the
Knife Blade for board and the Fine-Point Blade for card) and checked by
`src/build/attach.js`:

- **held**: every part touches something that leads, part by part, to the
  floor (floor pieces) or the wall (wall pieces). Bought supports (dowels,
  wire, brass tube) count once they are modelled.
- **no crossings**: no part runs through the middle of another. A tab in a
  slot, an edge glued on a face and a cross-lap with slits are fine.
- **strips**: no strip of material narrower than the cutter's smallest clean
  feature (`minJointFeature`: knife 3 mm, fine blade 1.5 mm, laser 1 mm).

Shells (nook, gable nook, alley, bookshop, staircase, greenhouse, two-storey
with straight, spiral and no stair) and the lighting parts (hidden base,
battery hatch and stops, switch mount, fan, turntable, speaker grille, cable
cover) were checked the same way from their own part lists. Every shell part
is held and jointed.

Ranked by how badly each breaks the build. Fixed items name their PR.

## 1. Part floats: nothing holds it

| Piece | Problem | Fix |
| --- | --- | --- |
| Floor lamp | The shade is an open tube hanging in the air; the pole stops in the middle of it and touches none of its walls. | Brass tube stem through a hole in the base, and a shade spider (rim ring with cross arms and a hub) glued on the shade's top edge, threaded on the stem. |
| Potted tree | The trunk stands in the middle of an open pot and the crowns float above it. | Soil top with a slot; the trunk is part of crown A and drops through the slot to the pot floor; crown B cross-laps onto it. |
| Garden planter | The greenery hangs in the open trough. | Soil top with slots; the greenery has two stems that drop through them. |

## 2. Parts pass through each other

| Piece | Problem | Fix |
| --- | --- | --- |
| Floor lamp | The pole runs straight through the base. | Hole in the base top for the stem. |
| Potted tree | The trunk and both crowns share space; the crowns cross with no slits cut. | Slits cut in both crowns (cross-lap), trunk on crown A. |
| Potted plant, Little plant | The leaves are wider than the pot and run through its walls. | Soil top with a slot; leaves on a stem that drops into it. |
| Hall coat stand | The stand runs through the base's top panel. | Slot in the base top; the stand stands on the base floor. |
| Crib | The mattress base overlaps the end panels and the front side. | Mattress base fits between the ends and sides. |

## 3. Too thin to cut cleanly

| Piece | Problem | Fix |
| --- | --- | --- |
| Crib | Slats 1.7 mm wide in 1.5 mm chipboard (knife needs 3 mm). | Fewer, wider slats with a 3 mm floor. |
| Library ladder | Rails and rungs 1.7 mm in chipboard. | Rails and rungs at least 3 mm. |
| Hall coat stand | Stand 1.75 mm wide. | Stand at least 3 mm. |
| Dressing table | Mirror frame 2 mm. | Frame at least 3 mm. |
| Fire screen, Row of books | 1.25 mm strips in card (fine blade needs 1.5 mm). | Wider frames; books become real folded blocks. |
| Fireplace | 1 mm sill under the hearth opening. | Opening starts higher. |
| Mantel, piano legs, loveseat arms | Boxes so thin that the panel between the joints is a 1–2.8 mm sliver. | Thin boxes are laminated from stacked layers instead of finger-jointed. |
| Vanity | 2.8 mm between the basin hole and the edge. | Smaller basin hole. |

## 4. Can't stand up on its own

| Piece | Problem | Fix |
| --- | --- | --- |
| Floor lamp | A 1.5 mm card strip as the pole can't carry a shade. | Brass tube stem (also carries the LED wires). |
| Fire screen | Three loose panels "hinged with tape". | One part folded on score lines into a zigzag. |
| Row of books | Flat strips one card thick, standing on edge. | Each book is a folded card block. |
| Library ladder | A single flat upright with nothing behind it. | Leans back with feet, and the note says what it leans on. |

## 5. The 3D view doesn't match the parts

| Where | Problem | Fix |
| --- | --- | --- |
| Dressing table | The mirror stands behind the table, on nothing. | Mirror stands on the back edge of the top. |
| Two-storey spiral stair | The dowel post is only in the steps text: not in 3D or the bill of materials. | Modelled as bought hardware, listed in the bill. |
| Lighting | Cable cover, motor mounts and the base's switch mount and hatch stops are cut but not drawn; the fan has no shaft. | Drawn where they go. |

## Status

Every item above is fixed.

| PR | What it fixed |
| --- | --- |
| #113 | Floor lamp: brass-tube stem in a hole in the base, and a shade spider. Adds the checker (`src/build/attach.js`), the regression test and the `rod` component for bought dowel, wire and tube. |
| #119 | Potted plant, little plant, potted tree, garden planter: soil tops with slots, stems that stand on the pot floor, and cross-lap slits in the tree crowns. |
| #122 | Coat stand in a slotted base. Crib with the mattress between the ends and slats of at least 3 mm. The library ladder became an A-frame step ladder (two ladders glued at the top). The fire screen is three panels angled into a zigzag. Adds a check that every floor piece stands on more than a line. |
| #124 | Boxes too thin to finger-joint (mantel, piano legs, armchair and loveseat arms) and the row of books are laminated from stacked layers. Fireplace sill, dressing-table frame and mirror, and vanity basin margin. |
| #126 | The spiral stair post is a bought dowel, drawn in 3D and listed in the bill. Motor mounts, the cable cover, the hatch stops and the switch mount are drawn where they go. |

Still open:

- Some boxes in 0.8 mm basswood get finger strips of 1.4 mm. These pass the fine blade, but a knife can't cut them cleanly.
- The fan rotor and turntable hang on the motor's own shaft, so the 3D view shows no shaft.
- With a book-nook shell, the cable cover and motor mounts are cut but not drawn.

## Guarding against regressions

`test/buildable.test.js` compiles every catalogue piece at its default,
smallest and largest sizes and fails when a part floats or passes through
another, and checks every shell the same way. New pieces get it for free.
