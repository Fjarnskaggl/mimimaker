# Community kits

Each file here is one room kit, shown in the [gallery](../gallery/) with a 3D
render and an **Open in mimimaker** link. Kits are added by pull request; there
are no accounts and no server.

## Format

`kits/<id>.kit.json`:

```json
{
  "format": "mimimaker-kit",
  "formatVersion": 1,
  "meta": {
    "id": "my-reading-nook",
    "title": "My Reading Nook",
    "author": "your-handle",
    "licence": "CC-BY-4.0",
    "remixedFrom": { "id": "reading-nook" },
    "description": "Up to 500 characters.",
    "tags": ["nook"]
  },
  "kit": { "…": "the design, exactly as a share link carries it" }
}
```

- **id**: lower-case words joined by `-`; the file name must be `<id>.kit.json`.
- **author**: a handle (letters, digits, `_ . -`), not an email or real name
  unless you want it shown.
- **licence**: `CC-BY-4.0`, `CC-BY-SA-4.0`, `CC-BY-NC-4.0` or `CC0`.
- **remixedFrom**: `null`, or the id of the kit in this folder you started from.
  The gallery credits it.

`npm test` checks every kit (valid metadata, the design compiles, remix links
resolve, no duplicate ids), so a pull request shows what's wrong.

The `mimimaker` kits are the app's built-in room types, regenerated with
`node gallery/seed.js`. Original designs only: no copied commercial kits,
logos or artwork.
