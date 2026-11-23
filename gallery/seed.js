// Regenerate the seed kits in kits/ from mimimaker's built-in room types.
//   node gallery/seed.js
// Only for the "mimimaker" seed set; community kits are added by pull request.

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defaultKit } from '../src/catalog.js';
import { ROOM_TYPES, applyRoomType } from '../src/templates.js';
import { makeEntry } from './kits.js';

const dir = join(resolve(new URL('..', import.meta.url).pathname), 'kits');
for (const rt of ROOM_TYPES) {
  const kit = applyRoomType(defaultKit(), rt.id);
  const entry = makeEntry(kit, {
    id: rt.id, title: kit.name, author: 'mimimaker', licence: 'CC0',
    description: rt.blurb, tags: ['starter'],
  });
  writeFileSync(join(dir, `${rt.id}.kit.json`), JSON.stringify(entry, null, 2) + '\n');
}
console.log(`Wrote ${ROOM_TYPES.length} seed kits to ${dir}`);
