# Inspector

The right-hand panel shows **only the selected thing**: a piece, the room, an opening, a light. Nothing selected means it shows the room. This replaces the long sidebar of every setting at once.

Structure, top to bottom:
1. Header: `overline` kind ("Piece", "Light", "Window"), `title` name, a `measure` line with its key sizes.
2. **Size and shape**: the fields people change most (3 at most per row).
3. **Material**: one select with its swatch and blade hint.
4. **Advanced**, a closed `<details>` with the rarely used settings (finger width, tab width, clearance).
5. Actions: secondary buttons (Duplicate, Rotate) and a danger "Remove" last.

Show inline Notices for problems with *this* thing only; everything else lives in the Checks pill. The consumer provides the selection and its fields.
