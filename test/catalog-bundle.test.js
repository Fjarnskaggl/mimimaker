// The site ships as one bundled page (scripts/build-single.js), so the
// catalogue must behave the same there as it does as ES modules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { bundle } from '../scripts/build-single.js';
import { CATALOG } from '../src/catalog.js';

function bundledModules(entry) {
  const { js } = bundle(fileURLToPath(new URL(entry, import.meta.url)));
  // Expose the module table instead of discarding it.
  const src = js.replace(/\}\)\(\);\s*$/, 'return __m;\n})();');
  return new Function(`return ${src}`)();
}

test('the bundled catalogue builds every piece exactly like the modules', () => {
  const m = bundledModules('../src/catalog.js');
  const bundled = m.catalog.CATALOG;
  assert.deepEqual(Object.keys(bundled), Object.keys(CATALOG));
  for (const [type, def] of Object.entries(CATALOG)) {
    const p = { ...def.defaults };
    for (const t of [1.5, 0.38]) {
      assert.deepEqual(bundled[type].build(p, { t }), def.build(p, { t }), `${type} @ ${t}`);
    }
    assert.deepEqual(bundled[type].size(p), def.size(p), `${type} size`);
  }
});
