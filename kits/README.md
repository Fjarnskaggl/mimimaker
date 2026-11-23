# Community kits

Each file here is one room kit, shown in the [gallery](../gallery/) with a 3D
render and an **Open in mimimaker** link. Kits are added by pull request; there
are no accounts and no server.

## Submitting a kit

In mimimaker, open your design and choose **File → Submit to the gallery…**.
Fill in a title, your handle and a licence, then download the file. Open the
[kits folder upload page](https://github.com/Fjarnskaggl/mimimaker/upload/main/kits),
sign in to GitHub (a free account is enough), drag the file in, choose
**Propose changes** and then **Create pull request**. The checks say if
anything needs fixing. A `kits/*.kit.json` file also opens in mimimaker
through **File → Open a file…**, credited to its author.

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
  The gallery credits it. A remix keeps its source's terms: a remix of a CC BY
  kit can't be CC0, a remix of a CC BY-SA kit must be CC BY-SA, and a remix of
  a CC BY-NC kit must be CC BY-NC.

`npm test` checks every kit (valid metadata, the design compiles, remix links
resolve, no duplicate ids), so a pull request shows what's wrong.

The `mimimaker` kits are the app's built-in room types, regenerated with
`node gallery/seed.js`. Original designs only: no copied commercial kits,
logos or artwork.
