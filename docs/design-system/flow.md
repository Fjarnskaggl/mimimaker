# Flow

The app follows the order a kit is made in: **Design → Light → Make → Build**. Each step owns the stage and its own tools; nothing from another step competes for attention. A **Start** screen comes before the steps, and a kit can jump between steps at any time.

## Start

A full-screen choice with `display-xl` heading "Make a tiny world": the room types (8) and book-nook shells as large cards, plus "Open a file" and "Blank room". Scale and machine are asked once here and remembered (both can be changed later in Make).

## 1 · Design

- **Stage:** the room, in Plan or 3D (Segmented). Click to select; drag to move; the selection gets a `mat` outline.
- **Tool rail:** Pieces (opens the library drawer: search, theme chips, PieceCards), Windows & doors (adds an opening to the selected wall), Room size.
- **Inspector:** the selected thing only. Nothing selected shows the room (size, structure board, wallpaper, floor, shell).
- **Hidden here:** materials table, machines, sheets, lighting, the guide.

## 2 · Light

- **Stage:** the same room in Night mode by default; LEDs glow; click a wall, ceiling or floor spot to add a light.
- **Inspector:** the selected light (where, colour, effect) or, with nothing selected, the circuit card (supply, current, battery life) and the wiring map.
- **Empty state:** `mimi-sleep`, "No lights yet".

## 3 · Make

- **Top:** the full KitMeter, the machine select and, for board materials, the fit test (SlotPicker) as a first-time card that collapses to a Calibrated chip.
- **Sheets:** SheetCards in a grid, grouped by material. One primary action for the step: **Download kit**.
- **Advanced:** finger width, tab width, labels with a pen.

## 4 · Build

The assembly steps, one at a time, with the exploded view, the parts to find, and a glue timer. The printable guide is a button here, not a tab.

## Where everything went

| Today | In the new flow |
| --- | --- |
| Sidebar: Room types | Start screen (also File → New from room type) |
| Sidebar: Kit & machine | Make (machine, scale on Start), Advanced in Make |
| Sidebar: Room box | Inspector when nothing is selected |
| Sidebar: Book nook shell | Start screen choice; Inspector when the room is selected |
| Sidebar: Windows & doors list | Tool rail + Inspector of the selected opening |
| Sidebar: Furniture list + Add a piece | Stage selection + library drawer; Inspector of the selected piece |
| Sidebar: Lighting | Light step |
| Sidebar: Materials table | Make → Materials (a dialog) |
| Tabs: 3D preview / Floor plan | Segmented Plan ↔ 3D on the Design stage |
| Tab: Make | Make step |
| Tab: LED map | Light step |
| Tab: Assembly guide | Build step |
| Warning banners above the stage | Checks pill in the header; inline Notice on the selected thing |
| Header: Undo, Redo, New, Open, Save, Share, Download | Undo/Redo and Share in the header; New, Open and Save in a File menu; Download kit on Make |

## Information budget

- The header holds at most 8 controls.
- The Inspector holds at most 4 sections, with 3 fields per row.
- Never more than one Notice on screen at once; everything else goes to Checks.
- Every view has exactly one primary button, or none.
